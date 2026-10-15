import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { supabase } from '@/lib/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard to view live automation status.' }, { status: 401 });
  try {
    const db = supabase();
    const { data: settings, error: settingsError } = await db.from('automation_settings')
      .select('enabled,niche,audience,destination_url,daily_pin_limit,timezone,board_id,board_name,last_batch_date,last_batch_at')
      .eq('id', 'primary').maybeSingle();
    if (settingsError) throw settingsError;

    const { data: queue, error: queueError } = await db.from('pin_queue').select('*').neq('status', 'cancelled').order('scheduled_at', { ascending: true }).limit(100);
    if (queueError) throw queueError;
    const { data: runs, error: runsError } = await db.from('automation_runs').select('id,status,summary,error_text,started_at,finished_at').order('finished_at', { ascending: false }).limit(12);
    if (runsError) throw runsError;
    const items = queue || [];
    return NextResponse.json({
      enabled: !!settings?.enabled,
      settings: settings || null,
      items,
      runs: runs || [],
      reviewRequired: items.filter((p: any) => p.status === 'review_required').length,
      queued: items.filter((p: any) => p.status === 'queued' || p.status === 'publishing').length,
      bufferDrafts: items.filter((p: any) => p.status === 'buffer_draft').length,
      bufferScheduled: items.filter((p: any) => p.status === 'buffer_scheduled').length,
      published: items.filter((p: any) => p.status === 'published').length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to fetch live automation status.' }, { status: 500 });
  }
}
