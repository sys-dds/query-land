import type { ResearchQueueRow, ScoredStartup } from "./types.js";
import { formatUsd } from "./utils.js";

export function buildResearchQueue(startups: ScoredStartup[], topN: number): ResearchQueueRow[] {
  return startups.slice(0, topN).map((startup, index) => {
    const name = startup.name ?? startup.slug;
    const category = startup.category ?? startup.categoryBucket;
    return {
      priorityRank: index + 1,
      name,
      website: startup.website,
      category: startup.category,
      mrrUsd: startup.mrrUsd,
      last30DaysUsd: startup.last30DaysUsd,
      finalOpportunityScore: startup.finalOpportunityScore,
      whyResearchThis: `${formatUsd(startup.mrrUsd)} MRR, ${startup.categoryBucket}, ${startup.opportunityNotes.slice(0, 2).join("; ")}`,
      googleSearchQuery: `"${name}" pricing`,
      competitorSearchQuery: `"${name}" alternatives`,
      pricingSearchQuery: `"${category}" SaaS pricing competitors`,
      founderSearchQuery: `"${name}" founder`,
      linkedinSearchQuery: `"${name}" LinkedIn`,
      productHuntSearchQuery: `"${name}" Product Hunt`,
      redditSearchQuery: `site:reddit.com ${category} tool`,
      alternativeToSearchQuery: `"${name}" AlternativeTo`
    };
  });
}
