import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { supabase } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard before changing live automation.' }, { status: 401 });
  try { const { error } = await supabase().from('automation_settings').update({ enabled: false, updated_at: new Date().toISOString() }).eq('id', 'primary'); if (error) throw error; return NextResponse.json({ ok: true, message: 'Automation paused. PinPilot will not create or submit new Pins while paused. Posts already scheduled inside Buffer may still publish; cancel them separately in Buffer if you need to stop them.' }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Unable to pause automation.' }, { status: 500 }); }
}
