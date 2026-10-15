import 'server-only';
export type PinIdea = { title: string; description: string; keywords: string[]; visualBrief: string; style: number };
export type SiteIdeaContext = {
  siteType?: string;
  title?: string;
  productName?: string;
  description?: string;
  priceText?: string;
  keywords?: string[];
  imageUrls?: string[];
};
const variants = [
  (n: string) => ({ title: n + ': The Complete Inspiration Guide', description: 'Explore ' + n.toLowerCase() + ' with a curated visual guide, useful details, and practical inspiration. Save this idea for your next project.', keywords: [n, n + ' ideas', n + ' inspiration'], style: 0 }),
  (n: string) => ({ title: '7 ' + n + ' Ideas Worth Saving', description: 'Discover ideas around ' + n.toLowerCase() + ' and bookmark the options that best fit your plans.', keywords: [n, 'best ' + n, n + ' ideas'], style: 1 }),
  (n: string) => ({ title: 'How to Choose ' + n, description: 'Use this visual guide to compare options and focus on the details that matter when choosing ' + n.toLowerCase() + '.', keywords: ['how to choose ' + n, n, n + ' checklist'], style: 2 }),
  (n: string) => ({ title: n + ': Details That Make a Difference', description: 'Explore useful details and practical tips around ' + n.toLowerCase() + ' to help plan your next step.', keywords: [n + ' tips', n, n + ' details'], style: 3 }),
  (n: string) => ({ title: n + ' Ideas for Your Next Project', description: 'Save this collection of ' + n.toLowerCase() + ' inspiration and revisit it when you are ready to plan your next step.', keywords: [n + ' inspiration', n, n + ' guide'], style: 4 }),
];
const stop = new Set('the and for with from your you our this that are was will can how what why into their have has its about using best new guide ideas by a an to of in on at as is it or be'.split(' '));
function cleanKeyword(value: string) { return value.replace(/\s+/g, ' ').trim().slice(0, 80); }
export function generateIdeas(niche: string, audience = 'United States', count = 3, site?: SiteIdeaContext, rotationSeed = ''): PinIdea[] {
  const clean = (site?.productName || site?.title || niche).trim().replace(/\s+/g, ' ').slice(0, 90) || 'creative ideas';
  const descriptionSource = (site?.description || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const siteKeywords = (site?.keywords || []).map(cleanKeyword).filter(Boolean);
  const rotation = Array.from(rotationSeed).reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 7) % variants.length;
  return Array.from({ length: Math.max(1, Math.min(5, Math.floor(count))) }, (_, i) => {
    const v = variants[(i + rotation) % variants.length](clean);
    const keywords = Array.from(new Set([...v.keywords, ...siteKeywords, niche].map(cleanKeyword).filter(k => k.length > 2 && !stop.has(k.toLowerCase())))).slice(0, 8);
    const productDetail = site?.priceText ? ' Product price shown on the source page: ' + site.priceText + '.' : '';
    const description = [
      v.description,
      descriptionSource ? 'Source page summary: ' + descriptionSource : '',
      productDetail,
      'Created for ' + (audience || 'your target audience') + '.',
    ].filter(Boolean).join(' ').slice(0, 750);
    const visualBrief = 'Original vertical 2:3 Pinterest creative for ' + clean + '. Site type: ' + (site?.siteType || 'website') +
      '. Use accurate product facts from the source page, readable hierarchy, high contrast, and no copied competitor artwork.';
    return { title: v.title.slice(0, 100), description, keywords, visualBrief, style: v.style };
  });
}
