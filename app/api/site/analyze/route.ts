import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { supabase } from '@/lib/server';
import { analyzePublicSite } from '@/lib/site-intelligence';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unlock the private dashboard before analyzing a website.' }, { status: 401 });
  let body: { url?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Send a valid JSON body.' }, { status: 400 }); }
  if (typeof body.url !== 'string' || body.url.length > 2048) {
    return NextResponse.json({ error: 'Provide a website URL shorter than 2048 characters.' }, { status: 400 });
  }
  try {
    const snapshot = await analyzePublicSite(body.url.trim());
    const { data, error } = await supabase().from('site_snapshots').insert({
      source_url: snapshot.sourceUrl,
      canonical_url: snapshot.canonicalUrl,
      site_type: snapshot.siteType,
      title: snapshot.title,
      description: snapshot.description,
      product_name: snapshot.productName,
      price_text: snapshot.priceText || null,
      image_urls: snapshot.imageUrls,
      keywords: snapshot.keywords,
      extracted_content: snapshot.extractedContent,
      source_status: snapshot.sourceStatus,
    }).select('id,captured_at').single();
    if (error) throw error;
    return NextResponse.json({ ok: true, snapshot, saved: data, note: 'Page metadata and visible text were extracted. This endpoint does not bypass logins, paywalls, or site access restrictions.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Site analysis failed.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
