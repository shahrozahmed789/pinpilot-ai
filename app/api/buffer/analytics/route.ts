import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { supabase } from '@/lib/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard before reading Buffer analytics.' }, { status: 401 });
  try {
    const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('days')) || 30));
    const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString();
    const { data, error } = await supabase().from('pin_performance')
      .select('impressions,saves,outbound_clicks,engagement_rate,captured_at,provider_post_id')
      .eq('provider', 'buffer')
      .gte('captured_at', since)
      .order('captured_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    const rows = data || [];
    const sum = (key: 'impressions' | 'saves' | 'outbound_clicks') => {
      const values = rows.map((row: any) => row[key]).filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value));
      return values.length ? values.reduce((total: number, value: number) => total + value, 0) : null;
    };
    const impressions = sum('impressions');
    const outboundClicks = sum('outbound_clicks');
    const rates = rows.map((row: any) => row.engagement_rate).filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value));
    return NextResponse.json({
      metrics: {
        impressions,
        saves: sum('saves'),
        outbound_clicks: outboundClicks,
        outbound_ctr: typeof impressions === 'number' && impressions > 0 && typeof outboundClicks === 'number'
          ? Math.round((outboundClicks / impressions) * 10000) / 100
          : null,
        engagement_rate: rates.length ? Math.round(rates.reduce((a: number, b: number) => a + b, 0) / rates.length * 100) / 100 : null,
        last_synced: rows[0]?.captured_at || null,
        measured_posts: new Set(rows.map((row: any) => row.provider_post_id).filter(Boolean)).size,
        source: 'Buffer per-post metrics returned by the provider',
      },
      message: rows.length
        ? 'Only metrics returned by Buffer are shown. Buffer may refresh network metrics with a delay.'
        : 'No supported Buffer metrics have been collected yet. Metrics remain blank until posts are sent and the provider returns measurements.',
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Buffer analytics are unavailable.' }, { status: 500 });
  }
}
