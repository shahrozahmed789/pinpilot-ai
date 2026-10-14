import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { bufferMode, getBufferPinterestTarget } from '@/lib/buffer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ connected: false, error: 'Unlock the private dashboard before checking Buffer.' }, { status: 401 });
  }

  try {
    const target = await getBufferPinterestTarget();
    const mode = bufferMode();
    const message = mode === 'test'
      ? `Buffer connection verified. Channel: ${target.channelName}; board: ${target.boardName}. Test mode does not submit posts.`
      : mode === 'draft'
        ? `Buffer is connected to ${target.channelName}. Due Pins will be sent as drafts, not published automatically.`
        : target.channelIsQueuePaused
          ? `Buffer is connected to ${target.channelName}, but its queue is paused. Resume the queue in Buffer before scheduling.`
          : `Buffer is connected to ${target.channelName}. Queue mode can schedule Pins.`;

    return NextResponse.json({
      connected: true,
      provider: 'Buffer',
      mode,
      organizationName: target.organizationName,
      channelName: target.channelName,
      boardName: target.boardName,
      boardUrl: target.boardUrl,
      queuePaused: target.channelIsQueuePaused,
      message,
    });
  } catch (e) {
    return NextResponse.json({
      connected: false,
      error: e instanceof Error ? e.message : 'Unable to connect to Buffer.',
    }, { status: 400 });
  }
}
