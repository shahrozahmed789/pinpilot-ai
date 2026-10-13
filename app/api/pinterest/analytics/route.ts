import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { pinterest } from '@/lib/pinterest';
export const runtime = 'nodejs';
function sumMetric(value: unknown, names: string[]): number | null {
  const wanted = new Set(names.map(s => s.toUpperCase())); let found = false; let total = 0;
  const seen = new Set<object>();
  function walk(node: unknown) {
    if (!node || typeof node !== 'object' || seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) { if (wanted.has(k.toUpperCase()) && typeof v === 'number') { total += v; found = true; } }
    // Some API responses represent a metric as { metric_type: "IMPRESSION", value: 123 }.
    const type = String(o.metric_type || o.metric || o.name || '').toUpperCase();
    if (wanted.has(type) && typeof o.value === 'number') { total += o.value; found = true; }
    for (const [k, v] of Object.entries(o)) if (k !== 'value') walk(v);
  }
  walk(value); return found ? total : null;
}
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard before reading Pinterest analytics.' }, { status: 401 });
  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('days')) || 30));
  const end = new Date(); const start = new Date(end.getTime() - (days - 1) * 86400000);
  const date = (d: Date) => d.toISOString().slice(0, 10);
  let account: unknown = null; let analyticsNote = '';
  try { const q = new URLSearchParams({ start_date: date(start), end_date: date(end), from_claimed_content: 'BOTH', pin_format: 'ALL', app_types: 'ALL', metric_types: 'IMPRESSION,SAVE,OUTBOUND_CLICK', split_field: 'NO_SPLIT' }); account = await pinterest(`/user_account/analytics?${q.toString()}`); }
  catch (e) { analyticsNote = e instanceof Error ? e.message : 'Account analytics are not available for this access token.'; }
  let allPins: any[] = []; let bookmark = ''; let pinListAvailable = true;
  try {
    for (let page = 0; page < 5; page++) {
      const q = new URLSearchParams({ page_size: '100', pin_metrics: 'true' }); if (bookmark) q.set('bookmark', bookmark);
      const res = await pinterest(`/pins?${q.toString()}`); const items = Array.isArray(res.items) ? res.items : []; allPins = allPins.concat(items); bookmark = res.bookmark || ''; if (!bookmark || items.length === 0) break;
    }
  } catch (e) { pinListAvailable = false; if (!analyticsNote) analyticsNote = e instanceof Error ? e.message : 'Pin list could not be read.'; }
  const metrics = {
    impressions: sumMetric(account, ['IMPRESSION', 'IMPRESSIONS']),
    saves: sumMetric(account, ['SAVE', 'SAVES']),
    outbound_clicks: sumMetric(account, ['OUTBOUND_CLICK', 'OUTBOUND_CLICKS']),
    outbound_ctr: null as number | null,
    total_pins: !pinListAvailable ? null : bookmark ? `${allPins.length}+` : allPins.length,
    last_synced: new Date().toISOString(),
  };
  if (typeof metrics.outbound_clicks === 'number' && typeof metrics.impressions === 'number' && metrics.impressions > 0) metrics.outbound_ctr = Math.round((metrics.outbound_clicks / metrics.impressions) * 10000) / 100;
  return NextResponse.json({ metrics, pins: allPins, accountAnalytics: account, message: analyticsNote ? `Pin list refreshed where available. Analytics detail: ${analyticsNote}` : `Analytics fetched for ${date(start)} to ${date(end)}. ${bookmark ? `At least ${allPins.length} Pins were scanned; the account has more than the 500-Pin scan limit.` : `${allPins.length} accessible Pins were counted.`}` });
}
