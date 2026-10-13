import 'server-only';
import { pinterest } from './pinterest';
import { supabase } from './server';
export type ResearchResult = { trends: any[]; suggestedTerms: any[]; competitorPins: any[]; sources: Array<{ name: string; status: string; detail: string }>; fetchedAt: string };
const countryCode = (audience: string) => /united states|usa|u\.s\./i.test(audience) ? 'US' : /united kingdom|uk|britain/i.test(audience) ? 'GB' : /canada/i.test(audience) ? 'CA' : /australia/i.test(audience) ? 'AU' : /pakistan/i.test(audience) ? 'PK' : 'US';
export async function collectResearch(niche: string, audience: string): Promise<ResearchResult> {
  const region = countryCode(audience);
  const result: ResearchResult = { trends: [], suggestedTerms: [], competitorPins: [], sources: [], fetchedAt: new Date().toISOString() };
  try {
    const data = await pinterest(`/trends/keywords/${region}/top/growing?limit=50`);
    const rows = Array.isArray(data.trends) ? data.trends : [];
    const tokens = niche.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2);
    result.trends = rows.filter((item: any) => { const kw = String(item.keyword || '').toLowerCase(); return tokens.some(t => kw.includes(t) || t.includes(kw)); }).slice(0, 15);
    result.sources.push({ name: 'Pinterest Trends API', status: 'available', detail: `Fetched ${rows.length} current ${region} trend terms; ${result.trends.length} matched this niche.` });
  } catch (e) {
    result.sources.push({ name: 'Pinterest Trends API', status: 'unavailable', detail: e instanceof Error ? e.message : 'This API endpoint is not available to the current app access.' });
  }
  try {
    const seed = niche.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    const data = await pinterest(`/terms/suggested?term=${encodeURIComponent(seed)}&country=${encodeURIComponent(region)}`);
    result.suggestedTerms = Array.isArray(data.items) ? data.items : Array.isArray(data.terms) ? data.terms : [];
    result.sources.push({ name: 'Pinterest suggested terms', status: 'available', detail: `Fetched ${result.suggestedTerms.length} suggested terms for the seed phrase.` });
  } catch (e) {
    result.sources.push({ name: 'Pinterest suggested terms', status: 'unavailable', detail: e instanceof Error ? e.message : 'Keyword suggestions are not available to the current app access.' });
  }
  try {
    const data = await pinterest(`/search/pins?query=${encodeURIComponent(niche)}&page_size=25`);
    result.competitorPins = (Array.isArray(data.items) ? data.items : []).slice(0, 25).map((pin: any) => ({ id: pin.id, title: pin.title || '', description: pin.description || '', link: pin.link || '', created_at: pin.created_at || null, pin_metrics: pin.pin_metrics || null }));
    result.sources.push({ name: 'Public Pin discovery', status: 'available', detail: `The API returned ${result.competitorPins.length} accessible search Pin(s). Private competitor analytics are never inferred.` });
  } catch (e) {
    result.sources.push({ name: 'Public Pin discovery', status: 'unavailable', detail: e instanceof Error ? e.message : 'Public Pin search is not available to the current API access.' });
  }
  try {
    const db = supabase();
    const { error } = await db.from('research_snapshots').insert({ niche, region, trend_data: result.trends, suggested_terms: result.suggestedTerms, competitor_pins: result.competitorPins, source_status: result.sources, captured_at: result.fetchedAt });
    if (error) throw error;
  } catch { /* Research remains useful in the current run even if snapshot storage has not been migrated yet. */ }
  return result;
}
