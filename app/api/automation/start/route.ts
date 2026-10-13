import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { supabase, getPinterestToken } from '@/lib/server';
import { pinterest } from '@/lib/pinterest';
import { runAutomationTick } from '@/lib/automation';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard before starting live automation.' }, { status: 401 });
  try {
    const body = await req.json();
    const niche = typeof body.niche === 'string' ? body.niche.trim().slice(0, 140) : '';
    const audience = typeof body.audience === 'string' ? body.audience.trim().slice(0, 80) : 'United States';
    const destinationUrl = typeof body.destinationUrl === 'string' ? body.destinationUrl.trim() : '';
    const dailyPinLimit = Math.max(1, Math.min(5, Number(body.dailyPinLimit) || 2));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'UTC';
    if (!niche) return NextResponse.json({ error: 'Enter a niche before starting.' }, { status: 400 });
    let dest: URL;
    try { dest = new URL(destinationUrl); } catch { return NextResponse.json({ error: 'Enter a valid destination URL beginning with https:// or http://.' }, { status: 400 }); }
    if (dest.protocol !== 'https:' && dest.protocol !== 'http:') return NextResponse.json({ error: 'Destination must be an HTTP or HTTPS website URL.' }, { status: 400 });
    await getPinterestToken();
    const boardsResponse = await pinterest('/boards?page_size=100');
    const board = (boardsResponse.items || [])[0];
    if (!board?.id) return NextResponse.json({ error: 'No Pinterest board was found. Create at least one board in Pinterest; PinPilot will choose it automatically.' }, { status: 409 });
    const db = supabase();
    const { data: previous, error: readError } = await db.from('automation_settings').select('*').eq('id', 'primary').maybeSingle();
    if (readError) throw readError;
    const sameConfig = previous && previous.niche === niche && previous.destination_url === dest.toString() && Number(previous.daily_pin_limit) === dailyPinLimit && previous.board_id === String(board.id);
    const { error } = await db.from('automation_settings').upsert({ id: 'primary', niche, audience, destination_url: dest.toString(), daily_pin_limit: dailyPinLimit, timezone, board_id: String(board.id), board_name: String(board.name || ''), enabled: true, last_batch_date: sameConfig ? previous.last_batch_date : null, updated_at: new Date().toISOString() });
    if (error) throw error;
    const run = await runAutomationTick({ forceNewBatch: !sameConfig });
    return NextResponse.json({ ok: true, enabled: true, boardName: String(board.name || ''), message: run.message || 'Automation started and saved on the server.', run });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to start automation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
