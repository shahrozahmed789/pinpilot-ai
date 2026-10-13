import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { collectResearch } from '@/lib/research';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard before running live research.' }, { status: 401 });
  const niche = (req.nextUrl.searchParams.get('niche') || '').trim().slice(0, 100);
  const audience = (req.nextUrl.searchParams.get('audience') || 'United States').trim().slice(0, 80);
  if (!niche) return NextResponse.json({ error: 'Provide a niche.' }, { status: 400 });
  try { const result = await collectResearch(niche, audience); return NextResponse.json({ ...result, message: 'Research finished. Source status reflects real API responses; unavailable data is not fabricated.' }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Research failed.' }, { status: 500 }); }
}
