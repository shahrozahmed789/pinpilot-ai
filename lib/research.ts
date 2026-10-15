import 'server-only';
import { pinterest } from './pinterest';
import { supabase } from './server';

export type ResearchResult = {
  trends: any[];
  suggestedTerms: any[];
  competitorPins: any[];
  sources: Array<{ name: string; status: string; detail: string }>;
  fetchedAt: string;
};
type SourceResult<T> = { data: T; source: { name: string; status: string; detail: string } };
const countryCode = (audience: string) =>
  /united states|usa|u\.s\./i.test(audience) ? 'US' :
  /united kingdom|uk|britain/i.test(audience) ? 'GB' :
  /canada/i.test(audience) ? 'CA' :
  /australia/i.test(audience) ? 'AU' :
  /pakistan/i.test(audience) ? 'PK' : 'US';

const decodeXml = (value: string) => value
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function fetchPinterestTrends(niche: string, region: string): Promise<SourceResult<any[]>> {
  try {
    const data = await pinterest('/trends/keywords/' + region + '/top/growing?limit=50', { signal: AbortSignal.timeout(4_000) });
    const rows = Array.isArray(data.trends) ? data.trends : [];
    const tokens = niche.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2);
    const matched = rows.filter((item: any) => {
      const keyword = String(item.keyword || '').toLowerCase();
      return tokens.some(token => keyword.includes(token) || token.includes(keyword));
    }).slice(0, 15);
    return { data: matched, source: { name: 'Pinterest Trends API', status: 'available', detail: 'Fetched ' + rows.length + ' growing ' + region + ' trend terms; ' + matched.length + ' matched this niche.' } };
  } catch (e) {
    return { data: [], source: { name: 'Pinterest Trends API', status: 'unavailable', detail: e instanceof Error ? e.message : 'Pinterest trend endpoint unavailable to current access.' } };
  }
}
async function fetchSuggestedTerms(niche: string, region: string): Promise<SourceResult<any[]>> {
  try {
    const seed = niche.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    const data = await pinterest('/terms/suggested?term=' + encodeURIComponent(seed) + '&country=' + encodeURIComponent(region), { signal: AbortSignal.timeout(4_000) });
    const terms = Array.isArray(data.items) ? data.items : Array.isArray(data.terms) ? data.terms : [];
    return { data: terms, source: { name: 'Pinterest suggested terms', status: 'available', detail: 'Fetched ' + terms.length + ' suggested terms for the seed phrase.' } };
  } catch (e) {
    return { data: [], source: { name: 'Pinterest suggested terms', status: 'unavailable', detail: e instanceof Error ? e.message : 'Pinterest keyword suggestions unavailable to current access.' } };
  }
}
async function fetchPublicPins(niche: string): Promise<SourceResult<any[]>> {
  try {
    const data = await pinterest('/search/pins?query=' + encodeURIComponent(niche) + '&page_size=25', { signal: AbortSignal.timeout(4_000) });
    const pins = (Array.isArray(data.items) ? data.items : []).slice(0, 25).map((pin: any) => ({
      id: pin.id, title: pin.title || '', description: pin.description || '', link: pin.link || '',
      created_at: pin.created_at || null, pin_metrics: pin.pin_metrics || null,
    }));
    return { data: pins, source: { name: 'Public Pin discovery', status: 'available', detail: 'Pinterest API returned ' + pins.length + ' accessible public Pin result(s). Private competitor analytics are not inferred.' } };
  } catch (e) {
    return { data: [], source: { name: 'Public Pin discovery', status: 'unavailable', detail: e instanceof Error ? e.message : 'Public Pin discovery unavailable to current access.' } };
  }
}
async function fetchGoogleTrends(niche: string, region: string): Promise<SourceResult<any[]>> {
  try {
    const url = new URL('https://trends.google.com/trending/rss');
    url.searchParams.set('geo', region);
    url.searchParams.set('hl', region === 'US' ? 'en-US' : region === 'GB' ? 'en-GB' : region === 'CA' ? 'en-CA' : region === 'AU' ? 'en-AU' : 'en-PK');
    const response = await fetch(url, {
      cache: 'no-store', signal: AbortSignal.timeout(4_000),
      headers: { 'User-Agent': 'PinPilotAI/1.0 (public trend feed)', Accept: 'application/rss+xml, application/xml, text/xml' },
    });
    if (!response.ok) throw new Error('Google Trends RSS returned HTTP ' + response.status + '.');
    const xml = (await response.text()).slice(0, 1_000_000);
    const rows = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
      const raw = (match[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      const keyword = decodeXml(raw);
      return keyword ? { keyword, source: 'Google Trends RSS' } : null;
    }).filter((item): item is { keyword: string; source: string } => Boolean(item));
    const tokens = niche.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2);
    const matched = rows.filter(item => tokens.some(token => item.keyword.toLowerCase().includes(token) || token.includes(item.keyword.toLowerCase())));
    return { data: matched, source: { name: 'Google Trends RSS', status: 'available', detail: 'Fetched ' + rows.length + ' broad ' + region + ' daily trend queries; ' + matched.length + ' matched this niche. No search volume or keyword difficulty was inferred.' } };
  } catch (e) {
    return { data: [], source: { name: 'Google Trends RSS', status: 'unavailable', detail: e instanceof Error ? e.message : 'Public trend feed unavailable.' } };
  }
}

export async function collectResearch(niche: string, audience: string): Promise<ResearchResult> {
  const region = countryCode(audience);
  const fetchedAt = new Date().toISOString();
  // Parallel, time-bounded source calls keep the 15-minute worker from spending a full timeout on each provider.
  const [pinterestTrend, suggested, publicPins, googleTrends] = await Promise.all([
    fetchPinterestTrends(niche, region),
    fetchSuggestedTerms(niche, region),
    fetchPublicPins(niche),
    fetchGoogleTrends(niche, region),
  ]);
  const result: ResearchResult = {
    trends: [...pinterestTrend.data, ...googleTrends.data].slice(0, 20),
    suggestedTerms: suggested.data,
    competitorPins: publicPins.data,
    sources: [pinterestTrend.source, suggested.source, publicPins.source, googleTrends.source],
    fetchedAt,
  };
  try {
    const { error } = await supabase().from('research_snapshots').insert({
      niche, region, trend_data: result.trends, suggested_terms: result.suggestedTerms,
      competitor_pins: result.competitorPins, source_status: result.sources, captured_at: fetchedAt,
    });
    if (error) await Promise.resolve(error);
  } catch { /* A source result remains useful if the optional snapshot write is unavailable. */ }
  return result;
}
