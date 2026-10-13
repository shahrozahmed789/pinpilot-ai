import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const ADMIN_COOKIE = 'pinpilot_admin_session';
const ttlSeconds = 60 * 60 * 24 * 14;
function signature(expiry: string) {
  const secret = process.env.DASHBOARD_SESSION_SECRET || '';
  return createHmac('sha256', secret).update(`pinpilot-session:${expiry}`).digest('hex');
}
export function isAdminConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET && process.env.DASHBOARD_SESSION_SECRET.length >= 32);
}
export function verifyDashboardPassword(candidate: string) {
  const expected = process.env.DASHBOARD_PASSWORD || '';
  if (!expected || !candidate || candidate.length > 512) return false;
  const a = Buffer.from(candidate); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createAdminSession() {
  const expiresAt = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  return { value: `${expiresAt}.${signature(expiresAt)}`, maxAge: ttlSeconds };
}
export function isAdminRequest(req: NextRequest) {
  if (!isAdminConfigured()) return false;
  const value = req.cookies.get(ADMIN_COOKIE)?.value || '';
  const [expiry, provided] = value.split('.');
  if (!expiry || !provided || !/^\d+$/.test(expiry) || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(expiry);
  const a = Buffer.from(provided); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function setAdminCookie(res: NextResponse) {
  const session = createAdminSession();
  res.cookies.set(ADMIN_COOKIE, session.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: session.maxAge });
  return res;
}
export function deleteAdminCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
