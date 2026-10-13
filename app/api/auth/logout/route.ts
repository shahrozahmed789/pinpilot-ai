import { NextResponse } from 'next/server';
import { deleteAdminCookie } from '@/lib/admin';
export const runtime = 'nodejs';
export async function POST() { return deleteAdminCookie(NextResponse.json({ ok: true })); }
