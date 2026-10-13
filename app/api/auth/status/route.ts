import { NextRequest, NextResponse } from 'next/server';
import { isAdminConfigured, isAdminRequest } from '@/lib/admin';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) { return NextResponse.json({ configured: isAdminConfigured(), authenticated: isAdminRequest(req) }); }
