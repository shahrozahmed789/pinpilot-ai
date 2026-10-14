import 'server-only';
import { supabase } from './server';
import { getBufferPinterestTarget, bufferMode, createBufferPinterestPost } from './buffer';
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
  if (process.env.PINTEREST_ANALYTICS_ENABLED !== 'true') {
    return { skipped: true, message: 'Full Pinterest analytics are deferred until PINTEREST_ANALYTICS_ENABLED=true after official API access is ready. Buffer API reporting is currently limited.' };
  }
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
  // Buffer is the temporary publishing connector while Pinterest API approval is pending.
  // Prefer the saved Buffer board service ID; fall back to the first available board.
  const target = await getBufferPinterestTarget(settings.board_id);
  const boardId = target.boardServiceId;
  const boardName = target.boardName;
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
