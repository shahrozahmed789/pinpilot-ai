import 'server-only';
import type { PinIdea } from './ideas';
import type { SiteSnapshot } from './site-intelligence';

export type ContentGenerationResult = { ideas: PinIdea[]; provider: 'openai' | 'rules'; note: string };

function outputText(payload: any): string {
  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
  }
  return parts.join('\n').trim();
}

/**
 * Uses the OpenAI Responses API only when the owner explicitly configures an API key.
 * Deterministic, product-grounded copy remains available without a paid provider.
 */
export async function enrichPinIdeasWithAI(
  baseIdeas: PinIdea[],
  input: { niche: string; audience: string; site?: SiteSnapshot; researchTerms: string[]; performanceTerms?: string[] },
): Promise<ContentGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ideas: baseIdeas, provider: 'rules', note: 'AI text provider is not configured; product-grounded rule-based copy used.' };
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const controller = AbortSignal.timeout(8_000);
  const schema = {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            visualBrief: { type: 'string' },
            style: { type: 'integer' },
          },
          required: ['title', 'description', 'keywords', 'visualBrief', 'style'],
          additionalProperties: false,
        },
      },
    },
    required: ['ideas'],
    additionalProperties: false,
  };
  const site = input.site ? {
    type: input.site.siteType,
    title: input.site.title,
    productName: input.site.productName,
    description: input.site.description,
    price: input.site.priceText,
    pageHeadings: input.site.extractedContent.h1,
    visibleTextExcerpt: input.site.extractedContent.text.slice(0, 1800),
    extractedKeywords: input.site.keywords,
  } : null;
  const system = [
    'You are a Pinterest SEO editor for a small online business.',
    'Use ONLY the provided source page and research terms as facts.',
    'Never invent prices, product features, search volume, keyword difficulty, trends, performance, guarantees, or competitor facts.',
    'Write unique, natural US-English Pinterest titles and descriptions; avoid keyword stuffing and do not append hashtag-only keyword dumps.',
    'Create exactly the requested number of distinct pin ideas. Keep titles <= 100 characters, descriptions <= 650 characters, and 3-8 concise keyword phrases each.',
    'When historicalTermsFromActuallyMeasuredBetterPerformingPins are present, consider them for relevance; they are internal heuristics from available provider metrics, not a promise of future results.',
    'Return a visualBrief that describes a layout using the actual source/product image if one exists, but do not claim an image has been generated.',
    'Return JSON that matches the supplied schema.',
  ].join(' ');
  const user = {
    requestedCount: baseIdeas.length,
    niche: input.niche,
    audience: input.audience,
    sourceSite: site,
    availableResearchTerms: input.researchTerms,
    historicalTermsFromActuallyMeasuredBetterPerformingPins: input.performanceTerms || [],
    existingAnglesToImprove: baseIdeas.map(i => ({ title: i.title, description: i.description, keywords: i.keywords, visualBrief: i.visualBrief })),
  };
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      cache: 'no-store',
      signal: controller,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_output_tokens: 1800,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: system }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(user) }] },
        ],
        text: { format: { type: 'json_schema', name: 'pin_ideas', strict: true, schema } },
      }),
    });
  } catch {
    return { ideas: baseIdeas, provider: 'rules', note: 'AI text provider timed out or was unavailable; safe rule-based copy used.' };
  }
  const raw = await response.text();
  if (!response.ok) {
    // Do not log the key or raw payload; fallback preserves safe draft generation.
    return { ideas: baseIdeas, provider: 'rules', note: 'AI text provider request failed with HTTP ' + response.status + '; safe rule-based copy used.' };
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return { ideas: baseIdeas, provider: 'rules', note: 'AI text provider returned an unreadable response; safe rule-based copy used.' }; }
  const text = outputText(payload);
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return { ideas: baseIdeas, provider: 'rules', note: 'AI output did not match JSON; safe rule-based copy used.' }; }
  const returned = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  if (returned.length !== baseIdeas.length) return { ideas: baseIdeas, provider: 'rules', note: 'AI returned an unexpected idea count; safe rule-based copy used.' };
  const normalized: PinIdea[] = [];
  for (const idea of returned) {
    if (!idea || typeof idea.title !== 'string' || typeof idea.description !== 'string' ||
      typeof idea.visualBrief !== 'string' || !Array.isArray(idea.keywords)) {
      return { ideas: baseIdeas, provider: 'rules', note: 'AI output failed validation; safe rule-based copy used.' };
    }
    const title = idea.title.trim().slice(0, 100);
    const description = idea.description.trim().slice(0, 650);
    const keywords: string[] = Array.from(new Set<string>((idea.keywords as unknown[]).filter((v: unknown): v is string => typeof v === 'string').map((v: string) => v.trim().slice(0, 80)).filter((v: string) => Boolean(v)))).slice(0, 8);
    if (!title || !description || keywords.length < 3) return { ideas: baseIdeas, provider: 'rules', note: 'AI output failed quality checks; safe rule-based copy used.' };
    normalized.push({ title, description, keywords, visualBrief: idea.visualBrief.trim().slice(0, 500), style: Number.isInteger(idea.style) ? Math.max(0, Math.min(4, idea.style)) : 0 });
  }
  const uniqueTitles = new Set(normalized.map(idea => idea.title.toLowerCase()));
  const uniqueDescriptions = new Set(normalized.map(idea => idea.description.toLowerCase()));
  if (uniqueTitles.size !== normalized.length || uniqueDescriptions.size !== normalized.length) {
    return { ideas: baseIdeas, provider: 'rules', note: 'AI returned duplicate copy angles; distinct rule-based variants used instead.' };
  }
  return { ideas: normalized, provider: 'openai', note: 'AI-generated Pinterest copy passed structural and length checks; all claims remain constrained to extracted facts.' };
}
