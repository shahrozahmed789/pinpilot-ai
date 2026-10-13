export type PinIdea = { title: string; description: string; keywords: string[]; visualBrief: string; style: number };
const variants = [
  (n: string) => ({ title: `${n}: The Complete Inspiration Guide`, description: `Explore ${n.toLowerCase()} with a curated visual guide, helpful details, and fresh inspiration for your next project. Save this idea for later.`, keywords: [n, `${n} ideas`, `${n} inspiration`], style: 0 }),
  (n: string) => ({ title: `7 ${n} Ideas Worth Saving`, description: `Need a fresh starting point? Discover seven thoughtful ${n.toLowerCase()} ideas and bookmark the ones that fit your style and plans.`, keywords: [n, `best ${n}`, `${n} trends`], style: 1 }),
  (n: string) => ({ title: `How to Choose ${n} That Fit Your Style`, description: `Use this simple visual checklist to compare details, find the right fit, and make a confident choice for your next project.`, keywords: [`how to choose ${n}`, n, `${n} checklist`], style: 2 }),
  (n: string) => ({ title: `${n}: Details That Make a Difference`, description: `Small details can make a big impact. Use these ${n.toLowerCase()} tips to plan a cohesive look and create a result that feels personal.`, keywords: [`${n} tips`, n, `${n} details`], style: 3 }),
  (n: string) => ({ title: `${n} Ideas for Your Next Project`, description: `Save this collection of ${n.toLowerCase()} inspiration and revisit it when you are ready to plan your next step.`, keywords: [`${n} inspiration`, n, `${n} guide`], style: 4 }),
];
export function generateIdeas(niche: string, audience = 'United States', count = 3): PinIdea[] {
  const clean = niche.trim().replace(/\s+/g, ' ').slice(0, 90) || 'creative ideas';
  return Array.from({ length: Math.max(1, Math.min(5, Math.floor(count))) }, (_, i) => {
    const v = variants[i % variants.length](clean);
    return { ...v, description: `${v.description} Created for ${audience || 'your target audience'}.`, visualBrief: `Original vertical 2:3 Pin graphic for ${clean}. Lead with “${v.title}”, use clear type hierarchy and no copied competitor artwork.` };
  });
}
