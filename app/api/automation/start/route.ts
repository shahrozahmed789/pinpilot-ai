import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { supabase } from '@/lib/server';
import { bufferMode } from '@/lib/buffer';
import { runAutomationTick } from '@/lib/automation';
import { isSafePublicWebsiteUrl } from '@/lib/site-intelligence';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unlock the private dashboard before starting live automation.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const niche = typeof body.niche === 'string' ? body.niche.trim().slice(0, 140) : '';
    const audience = typeof body.audience === 'string' ? body.audience.trim().slice(0, 80) : 'United States';
    const destinationUrl = typeof body.destinationUrl === 'string' ? body.destinationUrl.trim() : '';
    const dailyPinLimit = Math.max(1, Math.min(5, Number(body.dailyPinLimit) || 2));
    const timezone = typeof body.timezone === 'string' ? body.timezone : 'America/Los_Angeles';
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); }
    catch { return NextResponse.json({ error: 'Select a valid IANA timezone.' }, { status: 400 }); }

    if (!niche) return NextResponse.json({ error: 'Enter a niche before starting.' }, { status: 400 });
    let destination: URL;
    try { destination = new URL(destinationUrl); }
    catch { return NextResponse.json({ error: 'Enter a valid destination URL beginning with https:// or http://.' }, { status: 400 }); }
    if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
      return NextResponse.json({ error: 'Destination must be an HTTP or HTTPS website URL.' }, { status: 400 });
    }
    if (!(await isSafePublicWebsiteUrl(destination.toString()))) {
      return NextResponse.json({ error: 'Destination must be a public website URL without embedded credentials or private/local hostnames.' }, { status: 400 });
    }

    const db = supabase();
    const { data: previous, error: readError } = await db.from('automation_settings').select('*').eq('id', 'primary').maybeSingle();
    if (readError) throw readError;

    // Discover Buffer's Pinterest channel and board. No Pinterest API token is required
    // for this temporary Buffer-publishing workflow.
    // Generation is a local Supabase/creative workflow. Never query Buffer during Start;
    // the scheduled worker handles publishing separately when Buffer is needed.
    const selectedBoardId = previous?.board_id || null;
    const selectedBoardName = previous?.board_name || null;
    const replacePending = body.replacePending === true;

    if (replacePending) {
      // Pause briefly before replacing only locally queued, unsubmitted Pins.
      const { error: pauseError } = await db.from('automation_settings')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('id', 'primary');
      if (pauseError) throw new Error('Could not pause the worker before replacing pending Pins: ' + pauseError.message);

      const { error: replaceError } = await db.from('pin_queue')
        .update({
          status: 'cancelled',
          last_error: 'Replaced from PinPilot dashboard before generating a fresh batch.',
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'queued')
        .is('buffer_post_id', null);
      if (replaceError) throw new Error('Could not clear old unsubmitted Pins: ' + replaceError.message);
    }
    const sameConfig = previous
      && previous.niche === niche
      && previous.destination_url === destination.toString()
      && previous.audience === audience
      && Number(previous.daily_pin_limit) === dailyPinLimit
      && previous.timezone === timezone
      && previous.board_id === selectedBoardId;

    const { error } = await db.from('automation_settings').upsert({
      id: 'primary',
      niche,
      audience,
      destination_url: destination.toString(),
      daily_pin_limit: dailyPinLimit,
      timezone,
      board_id: selectedBoardId,
      board_name: selectedBoardName,
      enabled: true,
      last_batch_date: replacePending ? null : sameConfig ? previous.last_batch_date : null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    // An explicit Start click requests a fresh batch instead of silently skipping today's existing batch.
    const run = await runAutomationTick({ forceNewBatch: true, skipBuffer: true });
    const mode = bufferMode();
    return NextResponse.json({
      ok: true,
      enabled: true,
      provider: 'Buffer',
      boardName: selectedBoardName || 'Buffer board will be selected when publishing',
      channelName: null,
      generationOnly: true,
      bufferMode: mode,
      message: run.message || `Buffer automation is configured in ${mode} mode.`,
      run,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to start Buffer automation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
