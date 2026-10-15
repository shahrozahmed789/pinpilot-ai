import 'server-only';
import { createHash } from 'node:crypto';
import { supabase } from './server';
import { getBufferPinterestTarget, bufferMode, createBufferPinterestPost, listBufferPinterestPosts } from './buffer';
import { pinterest } from './pinterest';
import { generateIdeas } from './ideas';
import { renderPinPng, renderProductPinPng } from './pin-image';
import { collectResearch } from './research';
import { analyzePublicSite, downloadSafePublicImage, type SiteSnapshot } from './site-intelligence';
import { getUpcomingPostingSlots } from './scheduling';
import { enrichPinIdeasWithAI } from './ai-content';

type Settings = { id: string; niche: string; audience: string; destination_url: string; daily_pin_limit: number; timezone: string; board_id: string | null; board_name: string | null; enabled: boolean; last_batch_date: string | null };
const ASSET_BUCKET = 'pinpilot-assets';
function dayInTimezone(timezone: string, value = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  } catch {
    // Time zones are validated when settings are saved; UTC is only a safe fallback.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
}
async function syncBufferPostsAndMetrics() {
  const db = supabase();
  const target = await getBufferPinterestTarget();
  const [{ data: localPosts, error: localError }, remotePosts] = await Promise.all([
    db.from('pin_queue').select('id,title,status,buffer_post_id,source_keywords,scheduled_at')
      .not('buffer_post_id', 'is', null)
      .in('status', ['buffer_scheduled', 'published', 'failed'])
      .order('updated_at', { ascending: false }).limit(100),
    listBufferPinterestPosts(target),
  ]);
  if (localError) throw new Error('Could not load local Buffer post records: ' + localError.message);
  const staleCutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: staleClaims, error: staleError } = await db.from('pin_queue').update({
    status: 'review_required',
    last_error: 'A Buffer submission worker stopped before recording a provider post ID. Check Buffer for an existing post before retrying to avoid duplicates.',
    updated_at: new Date().toISOString(),
  }).eq('status', 'publishing').is('buffer_post_id', null).not('source_url', 'is', null).lt('updated_at', staleCutoff).select('id');
  if (staleError) await recordRun('warning', 'Could not recover stale Phase-2 publishing claims.', staleError.message);
  const staleCount = staleClaims?.length || 0;

  const remoteById = new Map<string, (typeof remotePosts)[number]>(remotePosts.map(post => [post.id, post] as const));
  let statusesUpdated = 0;
  let metricsUpdated = 0;

  for (const local of localPosts || []) {
    const postId = String(local.buffer_post_id || '');
    const remote = remoteById.get(postId);
    if (!remote) continue;
    const remoteStatus = remote.status.toLowerCase();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (remoteStatus === 'sent' && local.status !== 'published') {
      updates.status = 'published';
      updates.published_at = new Date().toISOString();
      updates.last_error = null;
    } else if (remoteStatus === 'error' && local.status !== 'failed') {
      updates.status = 'failed';
      updates.last_error = 'Buffer reports that this scheduled post failed to publish. Open the post in Buffer for the provider error details.';
    } else if (['scheduled', 'sending'].includes(remoteStatus) && local.status !== 'buffer_scheduled') {
      updates.status = 'buffer_scheduled';
      updates.last_error = null;
    }
    if (Object.keys(updates).length > 1) {
      const { error } = await db.from('pin_queue').update(updates).eq('id', local.id);
      if (error) await recordRun('warning', 'Buffer status could not be synchronized for a post.', error.message);
      else statusesUpdated++;
    }

    const metrics = Array.isArray(remote.metrics) ? remote.metrics : [];
    if (remoteStatus !== 'sent' || metrics.length === 0) continue;
    const findMetric = (pattern: RegExp) => {
      const value = metrics.find(metric => pattern.test((String(metric.type || '') + ' ' + String(metric.name || '')).toLowerCase()));
      const number = value?.value == null ? null : Number(value.value);
      return number !== null && Number.isFinite(number) ? number : null;
    };
    const impressions = findMetric(/impression/);
    const saves = findMetric(/save|bookmark/);
    const outboundClicks = findMetric(/outbound.*click|link.*click|click[- ]through/);
    const engagementRate = findMetric(/engagement.*rate|engagementrate/);
    // Save only metrics the provider actually returned; absent metrics stay NULL.
    if ([impressions, saves, outboundClicks, engagementRate].every(value => value === null)) continue;
    const { error: metricsError } = await db.from('pin_performance').upsert({
      pin_queue_id: local.id,
      provider: 'buffer',
      provider_post_id: postId,
      impressions, saves, outbound_clicks: outboundClicks, engagement_rate: engagementRate,
      raw_payload: { metrics, metrics_updated_at: remote.metricsUpdatedAt, provider_status: remote.status },
      captured_at: remote.metricsUpdatedAt || new Date().toISOString(),
    }, { onConflict: 'provider,provider_post_id' });
    if (metricsError) await recordRun('warning', 'Buffer metrics were fetched but could not be saved.', metricsError.message);
    else metricsUpdated++;
  }
  const message = 'Buffer post sync completed: ' + statusesUpdated + ' status change(s), ' + metricsUpdated + ' metric row(s) updated, ' + staleCount + ' stale submission(s) moved to manual review.';
  return { statusesUpdated, metricsUpdated, message };
}

async function getPerformanceKeywordSignals() {
  const db = supabase();
  const { data, error } = await db.from('pin_performance')
    .select('impressions,saves,outbound_clicks,pin_queue(source_keywords,title)')
    .order('captured_at', { ascending: false }).limit(100);
  if (error || !data?.length) return [];
  const scores = new Map<string, number>();
  for (const row of data as any[]) {
    const impressions = Number(row.impressions) || 0;
    const saves = Number(row.saves) || 0;
    const clicks = Number(row.outbound_clicks) || 0;
    if (impressions + saves + clicks <= 0) continue;
    const score = saves * 3 + clicks * 5 + impressions / 1000;
    const relation = Array.isArray(row.pin_queue) ? row.pin_queue[0] : row.pin_queue;
    const keywords: unknown[] = Array.isArray(relation?.source_keywords) ? relation.source_keywords : [];
    for (const raw of keywords) {
      if (typeof raw !== 'string') continue;
      const term = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!term) continue;
      scores.set(term, (scores.get(term) || 0) + score);
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([term]) => term);
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
  const timezone = settings.timezone || 'America/Los_Angeles';
  const today = dayInTimezone(timezone);
  if (!force && settings.last_batch_date === today) return { created: 0, skipped: true, message: "Today's batch is already prepared for " + today + "." };

  const target = await getBufferPinterestTarget(settings.board_id);
  const boardId = target.boardServiceId;
  const boardName = target.boardName;
  let siteSnapshot: SiteSnapshot | undefined;
  let siteSummary = 'Website intelligence unavailable; template copy used.';
  try {
    siteSnapshot = await analyzePublicSite(settings.destination_url);
    siteSummary = 'Analyzed destination as ' + siteSnapshot.siteType + '; extracted ' + siteSnapshot.keywords.length + ' page-derived keywords and ' + siteSnapshot.imageUrls.length + ' image URL(s).';
    const { error: snapshotError } = await db.from('site_snapshots').insert({
      source_url: siteSnapshot.sourceUrl, canonical_url: siteSnapshot.canonicalUrl, site_type: siteSnapshot.siteType,
      title: siteSnapshot.title, description: siteSnapshot.description, product_name: siteSnapshot.productName,
      price_text: siteSnapshot.priceText || null, image_urls: siteSnapshot.imageUrls, keywords: siteSnapshot.keywords,
      extracted_content: siteSnapshot.extractedContent, source_status: siteSnapshot.sourceStatus,
    });
    if (snapshotError) await recordRun('warning', 'Site content extracted but snapshot storage is unavailable.', snapshotError.message);
  } catch (e) {
    siteSummary = 'Website analysis unavailable: ' + (e instanceof Error ? e.message : 'unknown extraction error') + '. Generic copy used instead.';
    await recordRun('warning', 'Website intelligence could not read the destination URL.', siteSummary);
  }

  let researchSummary = 'Research unavailable; no trend data fabricated.';
  let researchTerms: string[] = [];
  try {
    const research = await collectResearch(settings.niche, settings.audience);
    const available = research.sources.filter(source => source.status === 'available').length;
    researchSummary = available + '/' + research.sources.length + ' research sources responded; ' + research.trends.length + ' matching trend(s), ' + research.suggestedTerms.length + ' suggested term(s), ' + research.competitorPins.length + ' accessible public Pin result(s).';
    researchTerms = [...research.trends.map((t: any) => String(t.keyword || '')), ...research.suggestedTerms.map((t: any) => String(t.keyword || t.term || t.value || ''))].filter(Boolean).slice(0, 10);
  } catch (e) { researchSummary = e instanceof Error ? e.message : 'Research source unavailable.'; }

  let performanceTerms: string[] = [];
  try { performanceTerms = await getPerformanceKeywordSignals(); }
  catch { performanceTerms = []; }
  researchTerms = Array.from(new Set([...performanceTerms, ...researchTerms])).slice(0, 10);
  const performanceSummary = performanceTerms.length
    ? 'Reused ' + performanceTerms.length + ' term(s) from actual measured higher-performing Pins.'
    : 'No usable historical per-Pin metrics yet; no performance trend was assumed.';

  await ensureAssetBucket();
  let ideas = generateIdeas(settings.niche, settings.audience, settings.daily_pin_limit, siteSnapshot, today);
  if (researchTerms.length) {
    for (const idea of ideas) idea.keywords = Array.from(new Set([...idea.keywords, ...researchTerms])).slice(0, 8);
  }
  const aiResult = await enrichPinIdeasWithAI(ideas, { niche: settings.niche, audience: settings.audience, site: siteSnapshot, researchTerms, performanceTerms });
  ideas = aiResult.ideas;
  const slots = getUpcomingPostingSlots(timezone, ideas.length, new Date());
  const safeSourceImages: Buffer[] = [];
  if (siteSnapshot) {
    for (const url of siteSnapshot.imageUrls.slice(0, 2)) {
      const asset = await downloadSafePublicImage(url);
      if (asset) { safeSourceImages.push(asset.buffer); break; }
    }
  }
  const rows = [];
  for (let i = 0; i < ideas.length; i++) {
    const idea = ideas[i];
    const sourceImage = safeSourceImages.length ? safeSourceImages[i % safeSourceImages.length] : null;
    let png: Buffer;
    try {
      png = sourceImage ? await renderProductPinPng(idea, settings.niche, sourceImage) : await renderPinPng(idea, settings.niche);
    } catch {
      png = await renderPinPng(idea, settings.niche);
    }
    const slug = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'pin';
    const imageUrl = await saveImage(png, today + '/' + Date.now() + '-' + i + '-' + slug + '.png');
    const title = idea.title.slice(0, 100);
    const description = (idea.description + ' ' + idea.keywords.map(k => '#' + k.replace(/[^a-z0-9 ]/gi, '').split(/\s+/).join('')).join(' ')).slice(0, 800);
    const scheduleDate = dayInTimezone(timezone, new Date(slots[i].scheduledAt));
    const keyMaterial = JSON.stringify([settings.niche, settings.audience, settings.destination_url, timezone, scheduleDate, slots[i].scheduledAt, title, boardId]);
    const idempotencyKey = createHash('sha256').update(keyMaterial).digest('hex');
    const checks = {
      titlePresent: Boolean(title.trim()),
      titleWithinPinterestLimit: title.length <= 100,
      descriptionPresent: Boolean(description.trim()),
      descriptionWithinConfiguredLimit: description.length <= 800,
      imageUsesHttps: imageUrl.startsWith('https://'),
      destinationUsesHttpOrHttps: /^https?:\/\//i.test(settings.destination_url),
      sourceProductImage: Boolean(sourceImage),
      creativeComposition: sourceImage ? 'product-image-mockup' : 'branded-template',
    };
    if (!checks.titlePresent || !checks.descriptionPresent || !checks.imageUsesHttps || !checks.destinationUsesHttpOrHttps) {
      throw new Error('Quality check failed before queue insertion for Pin: ' + title);
    }
    rows.push({
      board_id: boardId, title, description, image_url: imageUrl, destination_url: settings.destination_url,
      source_url: settings.destination_url, product_snapshot: siteSnapshot || null, quality_checks: checks, idempotency_key: idempotencyKey,
      scheduled_at: slots[i].scheduledAt, status: 'queued', buffer_post_id: null, source_keywords: idea.keywords,
      source: sourceImage ? 'PinPilot product-image mockup' : 'PinPilot template renderer',
    });
  }
  const { data, error } = await db.from('pin_queue').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id,title,scheduled_at,status');
  if (error) throw new Error('Queue insert failed: ' + error.message);
  const { error: settingsError } = await db.from('automation_settings').update({ board_id: boardId, board_name: boardName, last_batch_date: today, last_batch_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', 'primary');
  if (settingsError) throw new Error('Could not update automation settings: ' + settingsError.message);
  const createdCount = data?.length || 0;
  await recordRun('succeeded', 'Prepared ' + createdCount + ' new Pin(s) for “' + boardName + '”. Site: ' + siteSummary + ' Research: ' + researchSummary + ' Performance learning: ' + performanceSummary);
  return {
    created: createdCount, queued: data || [], boardId, boardName, researchSummary, siteSummary,
    message: createdCount + ' new Pin(s) prepared. ' + siteSummary + ' Research: ' + researchSummary + ' Performance learning: ' + performanceSummary + ' AI copy: ' + aiResult.provider + '. ' +
      ' Image choice: public source imagery is used for marketplace/ecommerce URLs when available; otherwise original template artwork is used.',
  };
}
async function publishDue(timezone: string) {
  const db = supabase();
  const mode = bufferMode();
  const target = await getBufferPinterestTarget();
  if (mode === 'test') {
    return [{ id: 'buffer-connection', status: 'test_mode', message: 'Buffer connection verified for channel "' + target.channelName + '" and board "' + target.boardName + '". No posts were sent to Buffer.' }];
  }

  let query = db.from('pin_queue').select('*')
    .eq('status', 'queued')
    .is('buffer_post_id', null)
    .order('scheduled_at', { ascending: true })
    .limit(3);
  // Draft mode intentionally waits until the local planned time before sending a draft.
  // Queue mode submits upcoming posts early, with customScheduled + dueAt, so Buffer
  // owns the actual scheduled publishing even if the browser is closed.
  if (mode === 'draft') query = query.lte('scheduled_at', new Date().toISOString());
  const { data: due, error } = await query;
  if (error) throw error;

  const results: Array<{ id: string; status: string; message?: string }> = [];
  for (const item of due || []) {
    const { data: claimed, error: claimError } = await db.from('pin_queue')
      .update({ status: 'publishing', attempt_count: (Number(item.attempt_count) || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', item.id).eq('status', 'queued').is('buffer_post_id', null).select('id').maybeSingle();
    if (claimError) { results.push({ id: item.id, status: 'claim_error', message: claimError.message }); continue; }
    if (!claimed) continue;

    let scheduledAt = String(item.scheduled_at || '');
    if (mode === 'queue' && (!Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) <= Date.now() + 2 * 60_000)) {
      scheduledAt = getUpcomingPostingSlots(timezone || 'America/Los_Angeles', 1, new Date())[0].scheduledAt;
    }
    let created: Awaited<ReturnType<typeof createBufferPinterestPost>>;
    try {
      const itemTarget = await getBufferPinterestTarget(item.board_id);
      const imageUrl = String(item.image_url || '');
      const title = String(item.title || 'PinPilot Pin').slice(0, 100);
      const description = String(item.description || '').slice(0, 800);
      const destinationUrl = item.destination_url ? String(item.destination_url) : null;
      if (!imageUrl.startsWith('https://') || !title.trim() || !description.trim() || (destinationUrl && !/^https?:\/\//i.test(destinationUrl))) {
        throw new Error('Pre-publish quality check failed: title, description, image URL, or destination URL is invalid.');
      }
      created = await createBufferPinterestPost({
        target: itemTarget, title, description, imageUrl, destinationUrl, mode,
        scheduledAt: scheduledAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Buffer publishing error';
      const attempts = Number(item.attempt_count || 0) + 1;
      const ambiguous = /fetch failed|timeout|timed out|ECONNRESET|ECONNREFUSED|socket|HTTP 5\d\d|network error/i.test(message);
      const update = ambiguous
        ? { status: 'review_required', last_error: ('Publishing result is uncertain; verify Buffer before retrying. ' + message).slice(0, 1000), updated_at: new Date().toISOString() }
        : attempts < 3
          ? { status: 'queued', scheduled_at: new Date(Date.now() + attempts * 60 * 60 * 1000).toISOString(), last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }
          : { status: 'failed', last_error: message.slice(0, 1000), updated_at: new Date().toISOString() };
      const { error: updateError } = await db.from('pin_queue').update(update).eq('id', item.id);
      results.push({ id: item.id, status: ambiguous ? 'review_required' : attempts < 3 ? 'retry_scheduled' : 'failed', message: updateError ? message + ' Queue status update also failed: ' + updateError.message : message });
      continue;
    }

    const finalStatus = mode === 'draft' ? 'buffer_draft' : 'buffer_scheduled';
    const { error: doneError } = await db.from('pin_queue').update({
      status: finalStatus, buffer_post_id: created.id, last_error: null,
      scheduled_at: mode === 'queue' ? (created.dueAt || scheduledAt) : (created.dueAt || item.scheduled_at),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    if (doneError) {
      const uncertainMessage = 'Buffer created post ' + created.id + ', but PinPilot could not update its database status: ' + doneError.message + '. Check Buffer before retrying.';
      // Do not put this post back in the queue; that risks a duplicate post.
      await db.from('pin_queue').update({ status: 'review_required', buffer_post_id: created.id, last_error: uncertainMessage.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', item.id);
      results.push({ id: item.id, status: 'review_required', message: uncertainMessage });
      continue;
    }
    results.push({ id: item.id, status: finalStatus, message: mode === 'draft'
      ? 'Pin sent to Buffer as a draft (' + created.id + '); it will not publish until scheduled in Buffer.'
      : 'Pin scheduled in Buffer for ' + (created.dueAt || scheduledAt) + ' (' + created.id + ').' });
  }
  return results;
}

export async function runAutomationTick(options?: { forceNewBatch?: boolean }) {
  const db = supabase();
  const { data: settings, error } = await db.from('automation_settings').select('*').eq('id', 'primary').maybeSingle();
  if (error) throw error;

  let bufferSyncMessage = 'Buffer post status sync was unavailable.';
  try {
    const sync = await syncBufferPostsAndMetrics();
    bufferSyncMessage = sync.message;
  } catch (e) {
    bufferSyncMessage = e instanceof Error ? e.message : 'Buffer post status sync failed.';
    await recordRun('warning', 'Buffer post synchronization could not complete.', bufferSyncMessage);
  }
  if (!settings || !settings.enabled) {
    return { enabled: false, generated: 0, published: [], bufferSyncMessage, message: 'Automation is paused or not configured. Existing posts already scheduled in Buffer may still publish; this tick only checked their status. ' + bufferSyncMessage };
  }
  const batch = await createDailyBatch(settings as Settings, Boolean(options?.forceNewBatch));
  const published = await publishDue(settings.timezone || 'America/Los_Angeles');
  let analyticsMessage = 'Pinterest analytics are deferred until official API reporting is enabled.';
  try { const snapshot = await captureAnalyticsSnapshotIfDue(); analyticsMessage = snapshot.message; }
  catch (e) { analyticsMessage = e instanceof Error ? e.message : 'Analytics snapshot unavailable.'; await recordRun('warning', 'Background analytics sync could not complete.', analyticsMessage); }
  const mode = bufferMode();
  const submitted = published.filter((item) => item.status === 'buffer_draft' || item.status === 'buffer_scheduled').length;
  const publishSummary = mode === 'test'
    ? 'Buffer connection test passed; no posts were submitted.'
    : mode === 'draft'
      ? `${submitted} due Pin(s) sent to Buffer as drafts.`
      : `${submitted} Pin(s) submitted to Buffer with their planned future times.`;
  await recordRun('succeeded', `Automation tick finished. Generated ${batch.created} new Pin(s). ${publishSummary} ${bufferSyncMessage} ${analyticsMessage}`);
  return { enabled: true, generated: batch.created, batchMessage: batch.message, published, analyticsMessage, bufferMode: mode, message: `${batch.message} ${publishSummary} ${bufferSyncMessage} ${analyticsMessage}` };
}
