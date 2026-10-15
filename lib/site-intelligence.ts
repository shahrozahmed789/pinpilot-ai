import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type SiteSnapshot = {
  sourceUrl: string;
  canonicalUrl: string;
  siteType: 'marketplace_listing' | 'ecommerce_product' | 'blog_or_content' | 'publisher_or_ads' | 'website';
  title: string;
  description: string;
  productName: string;
  priceText: string;
  imageUrls: string[];
  keywords: string[];
  extractedContent: { h1: string[]; text: string; jsonLdTypes: string[] };
  sourceStatus: 'available';
};

function privateV4(ip: string) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = p[0], b = p[1];
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
}
function privateIp(ip: string) {
  const version = isIP(ip);
  if (version === 4) return privateV4(ip);
  if (version !== 6) return true;
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') ||
    v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') ||
    v.startsWith('feb') || v.startsWith('2001:db8')) return true;
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? privateV4(mapped[1]) : false;
}
async function safePublicUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP or HTTPS website URLs are supported.');
  if (url.username || url.password) throw new Error('URLs containing embedded credentials are not allowed.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private or local website addresses are not allowed.');
  }
  if (isIP(host)) {
    if (privateIp(host)) throw new Error('Private or reserved IP addresses are not allowed.');
  } else {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(a => privateIp(a.address))) throw new Error('Website host did not resolve exclusively to public IP addresses.');
  }
  return url;
}
function decode(value: string) {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n) || 32)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16) || 32)));
}
function attributes(tag: string) {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return out;
}
function absolute(value: unknown, base: string) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const u = new URL(value.trim(), base); return ['https:', 'http:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; }
}
function flattenJsonLd(value: unknown, out: Record<string, any>[] = []) {
  if (Array.isArray(value)) { for (const item of value) flattenJsonLd(item, out); return out; }
  if (!value || typeof value !== 'object') return out;
  const obj = value as Record<string, any>;
  out.push(obj);
  if (obj['@graph']) flattenJsonLd(obj['@graph'], out);
  return out;
}
function cleanText(html: string) {
  return decode(html.replace(/<(script|style|svg|noscript|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 5000);
}
const stopWords = new Set('the and for with from your you our this that are was will can how what why into their have has its about using best new guide ideas by a an to of in on at as is it or be'.split(' '));

export async function analyzePublicSite(rawUrl: string): Promise<SiteSnapshot> {
  let current = await safePublicUrl(rawUrl);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    response = await fetch(current.toString(), {
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(6_000),
      headers: { 'User-Agent': 'PinPilotAI/1.0 (public website metadata reader)', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Website returned a redirect without a destination.');
      if (redirects === 3) throw new Error('Website redirected too many times.');
      current = await safePublicUrl(new URL(location, current).toString());
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw new Error('Website returned HTTP ' + (response?.status || 'unknown') + '.');
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error('Destination did not return an HTML page that can be analyzed.');
  if (Number(response.headers.get('content-length') || 0) > 1_500_000) throw new Error('Website HTML is too large to analyze safely.');
  if (!response.body) throw new Error('Website returned an empty response body.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (total < 1_500_000) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value); total += part.value.byteLength;
    }
  } finally { try { await reader.cancel(); } catch { /* the stream may already be closed */ } }
  const html = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
  if (!html.trim()) throw new Error('Website returned an empty HTML page.');

  const metas: Record<string, string> = {};
  let canonical = '';
  for (const match of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const a = attributes(match[0]);
    if (match[1].toLowerCase() === 'meta') {
      const key = (a.property || a.name || a.itemprop || '').toLowerCase();
      if (key && a.content && !metas[key]) metas[key] = a.content;
    } else if (/\bcanonical\b/i.test(a.rel || '') && a.href) canonical = absolute(a.href, current.toString());
  }
  const title = decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').trim()) ||
    metas['og:title'] || metas['twitter:title'] || '';
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => cleanText(m[1])).filter(Boolean).slice(0, 8);
  const jsonRecords: Record<string, any>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { flattenJsonLd(JSON.parse(match[1].trim()), jsonRecords); } catch { /* fall back to page metadata */ }
  }
  const types = jsonRecords.flatMap(o => Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).filter((v): v is string => typeof v === 'string');
  const products = jsonRecords.filter(o => /product/i.test([].concat(o['@type'] || []).join(' ')));
  const articles = jsonRecords.some(o => /article|blogposting|newsarticle/i.test([].concat(o['@type'] || []).join(' ')));
  const product = products[0] || {};
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
  const productName = String(product.name || metas['og:title'] || title || h1[0] || '').slice(0, 180);
  const priceText = offer.price != null ? (String(offer.priceCurrency || '') + ' ' + String(offer.price)).trim() :
    metas['product:price:amount'] ? (String(metas['product:price:currency'] || '') + ' ' + metas['product:price:amount']).trim() : '';
  const imageCandidates: unknown[] = [metas['og:image'], metas['twitter:image'], product.image, product.thumbnailUrl];
  const imageValues: unknown[] = [];
  for (const v of imageCandidates) {
    if (Array.isArray(v)) imageValues.push(...v);
    else if (v && typeof v === 'object') imageValues.push((v as any).url || (v as any).contentUrl);
    else imageValues.push(v);
  }
  const imageUrls = Array.from(new Set(imageValues.map(v => absolute(v, current.toString())).filter(Boolean))).slice(0, 8);
  const description = String(metas.description || metas['og:description'] || metas['twitter:description'] || product.description || '').slice(0, 800);
  const text = cleanText(html);
  const kwSource = [metas.keywords || '', title, description, h1.join(', ')].join(', ');
  const keywords = Array.from(new Set(kwSource.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !stopWords.has(w)))).slice(0, 30);
  const host = current.hostname.toLowerCase();
  const hasAds = /pagead2\.googlesyndication\.com|googlesyndication\.com\/pagead|ca-pub-\d+/i.test(html);
  let siteType: SiteSnapshot['siteType'] = 'website';
  if (host === 'etsy.com' || host.endsWith('.etsy.com')) siteType = 'marketplace_listing';
  else if (products.length || (/add to cart|buy now|shopify|woocommerce/i.test(html.slice(0, 250_000)) && /price|product/i.test(title + ' ' + description))) siteType = 'ecommerce_product';
  else if (hasAds) siteType = 'publisher_or_ads';
  else if (articles || /\/(blog|article|news)\//i.test(current.pathname) || /blog|article|news/i.test(types.join(' '))) siteType = 'blog_or_content';
  return {
    sourceUrl: rawUrl, canonicalUrl: canonical || current.toString(), siteType,
    title: title.slice(0, 200), description, productName, priceText, imageUrls, keywords,
    extractedContent: { h1, text: text.slice(0, 3000), jsonLdTypes: types.slice(0, 20) },
    sourceStatus: 'available',
  };
}

export async function isSafePublicHttpsAsset(rawUrl: string) {
  try {
    let current = await safePublicUrl(rawUrl);
    if (current.protocol !== 'https:') return false;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
        headers: { Range: 'bytes=0-1023', Accept: 'image/jpeg,image/png,image/webp,image/gif,image/heic' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        try { await response.body?.cancel(); } catch { /* ignore */ }
        if (!location || redirects === 3) return false;
        current = await safePublicUrl(new URL(location, current).toString());
        if (current.protocol !== 'https:') return false;
        continue;
      }
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const size = Number(response.headers.get('content-length') || 0);
      const ok = response.ok && ['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif'].includes(mime) && (!size || size <= 10 * 1024 * 1024);
      try {
        const reader = response.body?.getReader();
        if (reader) {
          await reader.read();
          await reader.cancel();
        }
      } catch { /* content probe is best-effort */ }
      return ok;
    }
    return false;
  } catch { return false; }
}

export async function isSafePublicWebsiteUrl(rawUrl: string) {
  try { await safePublicUrl(rawUrl); return true; } catch { return false; }
}


/** Download a public HTTPS image with DNS/redirect checks and a strict size cap. */
export async function downloadSafePublicImage(rawUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    let current = await safePublicUrl(rawUrl);
    if (current.protocol !== 'https:') return null;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(3_500),
        headers: { 'User-Agent': 'PinPilotAI/1.0 (public product image reader)', Accept: 'image/jpeg,image/png,image/webp,image/gif' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        try { await response.body?.cancel(); } catch { /* ignore */ }
        if (!location || redirects === 3) return null;
        current = await safePublicUrl(new URL(location, current).toString());
        if (current.protocol !== 'https:') return null;
        continue;
      }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!response.ok || !['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
        try { await response.body?.cancel(); } catch { /* ignore */ }
        return null;
      }
      const reportedSize = Number(response.headers.get('content-length') || 0);
      const limit = 8 * 1024 * 1024;
      if (reportedSize > limit || !response.body) {
        try { await response.body?.cancel(); } catch { /* ignore */ }
        return null;
      }
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          total += part.value.byteLength;
          if (total > limit) { await reader.cancel(); return null; }
          chunks.push(Buffer.from(part.value));
        }
      } finally { try { reader.releaseLock(); } catch { /* ignore */ } }
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) return null;
      return { buffer, mimeType };
    }
  } catch { return null; }
  return null;
}
