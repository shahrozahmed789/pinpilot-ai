import { NextRequest, NextResponse } from 'next/server';
import { runAutomationTick } from '@/lib/automation';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized scheduled worker request.' }, { status: 401 });
  try { return NextResponse.json(await runAutomationTick()); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Automation tick failed.' }, { status: 500 }); }
}
