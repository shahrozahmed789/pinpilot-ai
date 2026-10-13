import 'server-only';
import { supabase, getPinterestToken } from './server';
import { pinterest } from './pinterest';
import { generateIdeas } from './ideas';
import { renderPinPng } from './pin-image';
import { collectResearch } from './research';

type Settings = { id: string; niche: string; audience: string; destination_url: string; daily_pin_limit: number; timezone: string; board_id: string | null; board_name: string | null; enabled: boolean; last_batch_date: string | null };
const ASSET_BUCKET = 'pinpilot-assets';
function dayInTimezone(timezone: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
async function ensureAssetBucket() {
  const db = supabase();
  const { error } = await db.storage.createBucket(ASSET_BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['image/png'] });
  if (error && !/already exists|duplicate|exists/i.test(error.message)) throw new Error(`Unable to prepare public Pin image storage: ${error.message}`);
}
async function saveImage(png: Buffer, filename: string) {
  const db = supabase();
  const { error } = await db.storage.from(ASSET_BUCKET).upload(filename, png, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`Pin image upload failed: ${error.message}`);
  const { data } = db.storage.from(ASSET_BUCKET).getPublicUrl(filename);
  if (!data.publicUrl.startsWith('https://')) throw new Error('Pin asset storage did not return a public HTTPS URL.');
  return data.publicUrl;
}
async function recordRun(status: string, summary: string, errorText?: string) {
  try { await supabase().from('automation_runs').insert({ status, summary, error_text: errorText || null, finished_at: new Date().toISOString() }); } catch { /* a log failure must not hide the actual run result */ }
}

function readMetricTotals(value: unknown, names: string[]) {
  const wanted = new Set(names.map((name) => name.toUpperCase()));
  const seen = new Set<object>();
  let total = 0; let found = false;
  function walk(node: unknown) {
    if (!node || typeof node !== 'object' || seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const object = node as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      if (wanted.has(key.toUpperCase()) && typeof child === 'number') { total += child; found = true; }
    }
    const type = String(object.metric_type || object.metric || object.name || '').toUpperCase();
    if (wanted.has(type) && typeof object.value === 'number') { total += object.value; found = true; }
    for (const [key, child] of Object.entries(object)) if (key !== 'value') walk(child);
  }
  walk(value);
  return found ? total : null;
}

/** Collect real Pinterest analytics periodically while the durable worker is active. */
async function captureAnalyticsSnapshotIfDue() {
  const db = supabase();
  const { data: latest, error: latestError } = await db.from('analytics_snapshots').select('captured_at').order('captured_at', { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new Error(`Could not check analytics sync time: ${latestError.message}`);
  const last = latest?.captured_at ? new Date(latest.captured_at).getTime() : 0;
  if (last && Date.now() - last < 6 * 60 * 60 * 1000) return { skipped: true, message: 'Analytics snapshot is still fresh.' };

  const end = new Date();
  const start = new Date(end.getTime() - 6 * 86400000);
  const date = (day: Date) => day.toISOString().slice(0, 10);
  let impressions: number | null = null;
  let saves: number | null = null;
  let outboundClicks: number | null = null;
  let totalPins: number | null = null;
  let completePinCount = false;
  let analyticsError: string | null = null;
  let accountPayload: unknown = null;

  try {
    const params = new URLSearchParams({ start_date: date(start), end_date: date(end), from_claimed_content: 'BOTH', pin_format: 'ALL', app_types: 'ALL', metric_types: 'IMPRESSION,SAVE,OUTBOUND_CLICK', split_field: 'NO_SPLIT' });
    accountPayload = await pinterest(`/user_account/analytics?${params.toString()}`);
    impressions = readMetricTotals(accountPayload, ['IMPRESSION', 'IMPRESSIONS']);
    saves = readMetricTotals(accountPayload, ['SAVE', 'SAVES']);
    outboundClicks = readMetricTotals(accountPayload, ['OUTBOUND_CLICK', 'OUTBOUND_CLICKS']);
  } catch (error) { analyticsError = error instanceof Error ? error.message : 'Account analytics are not available.'; }

  try {
    let bookmark = ''; let count = 0; let failed = false;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({ page_size: '100', pin_metrics: 'true' });
      if (bookmark) params.set('bookmark', bookmark);
      const response = await pinterest(`/pins?${params.toString()}`);
      const items = Array.isArray(response.items) ? response.items : [];
      count += items.length; bookmark = response.bookmark || '';
      if (!bookmark || items.length === 0) break;
    }
    totalPins = bookmark ? null : count;
    completePinCount = !bookmark;
  } catch (error) {
    if (!analyticsError) analyticsError = error instanceof Error ? error.message : 'Pin count is not available.';
  }

  const rawPayload = { account: accountPayload, total_pins_complete: completePinCount, error: analyticsError };
  const { error: insertError } = await db.from('analytics_snapshots').insert({ snapshot_date: date(end), impressions, saves, outbound_clicks: outboundClicks, total_pins: totalPins, raw_payload: rawPayload, captured_at: new Date().toISOString() });
  if (insertError) throw new Error(`Could not save analytics snapshot: ${insertError.message}`);
  if (analyticsError) await recordRun('warning', 'Analytics snapshot saved with unavailable values.', analyticsError);
  return { skipped: false, message: analyticsError ? `Analytics snapshot saved with some unavailable data: ${analyticsError}` : 'Pinterest analytics snapshot saved.' };
}
export async function createDailyBatch(settings: Settings, force = false) {
  const db = supabase();
  const today = dayInTimezone(settings.timezone || 'UTC');
  if (!force && settings.last_batch_date === today) return { created: 0, skipped: true, message: `Today's batch is already prepared for ${today}.` };
  // The default target board is chosen automatically from the connected user's own boards.
  let boardId = settings.board_id;
  let boardName = settings.board_name || '';
  if (!boardId) {
    const result = await pinterest('/boards?page_size=100');
    const first = (result.items || [])[0];
    if (!first?.id) throw new Error('No Pinterest board is available. Create at least one board in your Pinterest account; PinPilot will then choose it automatically.');
    boardId = String(first.id); boardName = String(first.name || 'Your Pinterest board');
  }
  let researchSummary = 'Research unavailable; template workflow continued.';
  let researchTerms: string[] = [];
  try {
    const research = await collectResearch(settings.niche, settings.audience);
    const available = research.sources.filter(s => s.status === 'available').length;
    researchSummary = `${available}/${research.sources.length} research sources responded; ${research.trends.length} matching trend(s), ${research.suggestedTerms.length} suggested term(s), ${research.competitorPins.length} accessible public Pin result(s).`;
    researchTerms = [...research.trends.map((t: any) => String(t.keyword || '')), ...research.suggestedTerms.map((t: any) => String(t.keyword || t.term || t.value || ''))].filter(Boolean).slice(0, 10);
  } catch (e) { researchSummary = e instanceof Error ? e.message : 'Research source unavailable.'; }
  await ensureAssetBucket();
  const ideas = generateIdeas(settings.niche, settings.audience, settings.daily_pin_limit);
  if (researchTerms.length) { for (const idea of ideas) idea.keywords = Array.from(new Set([...idea.keywords, ...researchTerms])).slice(0, 8); }
  const now = Date.now();
  const gapMs = Math.floor((24 * 60 * 60 * 1000) / (ideas.length + 1));
  const rows = [];
  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];
    const png = await renderPinPng(idea, settings.niche);
    const slug = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'pin';
    const imageUrl = await saveImage(png, `${today}/${now}-${i}-${slug}.png`);
    rows.push({ board_id: boardId, title: idea.title.slice(0, 100), description: `${idea.description} ${idea.keywords.map(k => `#${k.replace(/[^a-z0-9 ]/gi, '').split(/\s+/).join('')}`).join(' ')}`.slice(0, 800), image_url: imageUrl, destination_url: settings.destination_url, scheduled_at: new Date(now + Math.max(15 * 60 * 1000, gapMs * (i + 1))).toISOString(), status: 'queued', source_keywords: idea.keywords, source: 'PinPilot template renderer' });
  }
  const { data, error } = await db.from('pin_queue').insert(rows).select('id,title,scheduled_at,status');
  if (error) throw new Error(`Queue insert failed: ${error.message}`);
  const { error: settingsError } = await db.from('automation_settings').update({ board_id: boardId, board_name: boardName, last_batch_date: today, last_batch_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', 'primary');
  if (settingsError) throw new Error(`Could not update automation settings: ${settingsError.message}`);
  await recordRun('succeeded', `Generated ${rows.length} Pin image(s) and queued them on board “${boardName}”. Research: ${researchSummary}`);
  return { created: rows.length, queued: data || [], boardId, boardName, researchSummary, message: `${rows.length} original template-rendered Pin images and SEO drafts were created and scheduled automatically. Research: ${researchSummary}` };
}
async function publishDue() {
  const db = supabase();
  const { data: due, error } = await db.from('pin_queue').select('*').eq('status', 'queued').lte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true }).limit(3);
  if (error) throw error;
  const results: Array<{ id: string; status: string; message?: string }> = [];
  for (const item of due || []) {
    // Conditional update claims a row before calling Pinterest to reduce duplicate publishes on overlapping cron runs.
    const { data: claimed, error: claimError } = await db.from('pin_queue').update({ status: 'publishing', attempt_count: (Number(item.attempt_count) || 0) + 1, updated_at: new Date().toISOString() }).eq('id', item.id).eq('status', 'queued').select('id').maybeSingle();
    if (claimError) { results.push({ id: item.id, status: 'claim_error', message: claimError.message }); continue; }
    if (!claimed) continue;
    try {
      await getPinterestToken();
      const payload: Record<string, unknown> = { board_id: item.board_id, title: item.title, description: item.description, media_source: { source_type: 'image_url', url: item.image_url } };
      if (item.destination_url) payload.link = item.destination_url;
      const pin = await pinterest('/pins', { method: 'POST', body: JSON.stringify(payload) });
      const { error: doneError } = await db.from('pin_queue').update({ status: 'published', pinterest_pin_id: pin.id, last_error: null, updated_at: new Date().toISOString() }).eq('id', item.id);
      if (doneError) throw doneError;
      results.push({ id: item.id, status: 'published', message: `Pinterest Pin ${pin.id} published.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown publishing error';
      const attempts = Number(item.attempt_count || 0) + 1;
      const retryable = attempts < 3;
      const update = retryable ? { status: 'queued', scheduled_at: new Date(Date.now() + attempts * 60 * 60 * 1000).toISOString(), last_error: message.slice(0, 1000), updated_at: new Date().toISOString() } : { status: 'failed', last_error: message.slice(0, 1000), updated_at: new Date().toISOString() };
      await db.from('pin_queue').update(update).eq('id', item.id);
      results.push({ id: item.id, status: retryable ? 'retry_scheduled' : 'failed', message });
    }
  }
  return results;
}
export async function runAutomationTick(options?: { forceNewBatch?: boolean }) {
  const db = supabase();
  const { data: settings, error } = await db.from('automation_settings').select('*').eq('id', 'primary').maybeSingle();
  if (error) throw error;
  if (!settings || !settings.enabled) return { enabled: false, generated: 0, published: [], message: 'Automation is paused or not configured.' };
  const batch = await createDailyBatch(settings as Settings, Boolean(options?.forceNewBatch));
  const published = await publishDue();
  let analyticsMessage = 'Analytics snapshot not due yet.';
  try { const snapshot = await captureAnalyticsSnapshotIfDue(); analyticsMessage = snapshot.message; }
  catch (e) { analyticsMessage = e instanceof Error ? e.message : 'Analytics snapshot unavailable.'; await recordRun('warning', 'Background analytics sync could not complete.', analyticsMessage); }
  await recordRun('succeeded', `Automation tick finished. Generated ${batch.created} new Pin(s); processed ${published.length} due post(s). ${analyticsMessage}`);
  return { enabled: true, generated: batch.created, batchMessage: batch.message, published, analyticsMessage, message: `${batch.message} Scheduled worker checked due posts. ${analyticsMessage}` };
}
