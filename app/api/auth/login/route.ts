import { NextRequest, NextResponse } from 'next/server';
import { isAdminConfigured, setAdminCookie, verifyDashboardPassword } from '@/lib/admin';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) return NextResponse.json({ error: 'Live controls are locked. Configure DASHBOARD_PASSWORD and a DASHBOARD_SESSION_SECRET with at least 32 characters in the hosting environment.' }, { status: 503 });
  let body: { password?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  if (typeof body.password !== 'string' || !verifyDashboardPassword(body.password)) return NextResponse.json({ error: 'Password did not match.' }, { status: 401 });
  return setAdminCookie(NextResponse.json({ ok: true, message: 'Private controls unlocked for 14 days on this browser.' }));
}
