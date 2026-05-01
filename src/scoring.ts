import type { CategoryBucket, NormalizedStartup, ScoredStartup } from "./types.js";
import { clamp, round, textIncludes } from "./utils.js";

const B2B_TERMS = ["b2b", "business", "saas", "agency", "developer", "founder", "shopify", "marketer", "accountant", "team", "company"];
const UTILITY_TERMS = ["api", "analytics", "report", "dashboard", "automation", "tool", "utility", "monitor", "generator", "converter", "template"];
const MARKETPLACE_TERMS = ["marketplace", "exchange", "network", "two-sided"];
const CONSUMER_TERMS = ["consumer", "mobile", "game", "social", "dating", "creator app"];
const COMPLIANCE_TERMS = ["fintech", "finance", "healthcare", "medical", "legal", "compliance", "security", "crypto", "web3", "insurance"];
const ENTERPRISE_TERMS = ["enterprise", "procurement", "fortune 500", "large companies"];
const MANUAL_TERMS = ["audit", "report", "seo", "content", "lead", "pdf", "monitor", "summary", "review", "checklist", "competitor"];

export function scoreStartups(startups: NormalizedStartup[]): ScoredStartup[] {
  return startups.map(scoreStartup).sort((a, b) => b.finalOpportunityScore - a.finalOpportunityScore);
}

function scoreStartup(startup: NormalizedStartup): ScoredStartup {
  const text = searchableText(startup);
  const avgMrrPerActiveSubUsd = startup.mrrUsd !== null && startup.activeSubscriptions && startup.activeSubscriptions > 0 ? round(startup.mrrUsd / startup.activeSubscriptions) : null;
  const avgRevenuePerCustomerUsd = startup.mrrUsd !== null && startup.customers && startup.customers > 0 ? round(startup.mrrUsd / startup.customers) : null;
  const isB2B = textIncludes(text, B2B_TERMS);
  const isHighTicket = (avgMrrPerActiveSubUsd ?? avgRevenuePerCustomerUsd ?? 0) >= 100;
  const isLowCustomerHighRevenue = (startup.activeSubscriptions ?? startup.customers ?? 999999) <= 50 && (startup.mrrUsd ?? 0) >= 1000;
  const isLowTrafficHighRevenue = (startup.visitorsLast30Days ?? 999999) <= 5000 && (startup.last30DaysUsd ?? startup.mrrUsd ?? 0) >= 1000;
  const categoryBucket = bucketFor(startup, text, isHighTicket);
  const rejectionFlags = rejectionFlagsFor(text, startup, categoryBucket);
  const revenueScore = logScore((startup.mrrUsd ?? 0) + (startup.last30DaysUsd ?? 0), 20000);
  const soloLikelihoodScore = soloScore(startup, text, categoryBucket);
  const roiScore = roi(startup, text, avgMrrPerActiveSubUsd, isB2B, categoryBucket);
  const buildEffortScore = buildEffort(text, categoryBucket);
  const buildEaseScore = round(100 - ((buildEffortScore - 1) / 9) * 100);
  const distributionDifficultyScore = distributionDifficulty(text, isB2B, categoryBucket);
  const manualValidationScore = manualValidation(text, categoryBucket);
  const inverseDistribution = 100 - ((distributionDifficultyScore - 1) / 9) * 100;
  const finalOpportunityScore = round(
    roiScore * 0.35 +
      soloLikelihoodScore * 0.2 +
      buildEaseScore * 0.15 +
      manualValidationScore * 0.15 +
      revenueScore * 0.1 +
      inverseDistribution * 0.05
  );
  const likelySoloOrTinyTeam = startup.founderCount === 1 || startup.founderCount === 2;

  return {
    ...startup,
    avgMrrPerActiveSubUsd,
    avgRevenuePerCustomerUsd,
    isB2B,
    isHighTicket,
    isLowCustomerHighRevenue,
    isLowTrafficHighRevenue,
    likelySoloOrTinyTeam,
    categoryBucket,
    rejectionFlags,
    opportunityNotes: notesFor(startup, categoryBucket, avgMrrPerActiveSubUsd, isB2B, manualValidationScore),
    revenueScore,
    soloLikelihoodScore,
    roiScore,
    buildEffortScore,
    buildEaseScore,
    distributionDifficultyScore,
    manualValidationScore,
    finalOpportunityScore
  };
}

function searchableText(startup: NormalizedStartup): string {
  return [startup.name, startup.description, startup.category, startup.targetAudience, startup.techStack.join(" ")].filter(Boolean).join(" ").toLowerCase();
}

function logScore(value: number, maxReference: number): number {
  if (value <= 0) return 0;
  return round(clamp((Math.log10(value + 1) / Math.log10(maxReference + 1)) * 100, 0, 100));
}

function soloScore(startup: NormalizedStartup, text: string, bucket: CategoryBucket): number {
  let score = 50;
  if (startup.founderCount === 1) score = 100;
  else if (startup.founderCount === 2) score = 75;
  else if (startup.founderCount === 3) score = 40;
  else if (startup.founderCount !== null && startup.founderCount > 3) score = 15;

  if ((startup.activeSubscriptions ?? 999999) <= 50 && (startup.mrrUsd ?? 0) >= 1000) score += 10;
  if ((startup.activeSubscriptions ?? 999999) <= 10 && (startup.mrrUsd ?? 0) >= 1000) score += 10;
  if (textIncludes(text, B2B_TERMS)) score += 5;
  if (textIncludes(text, UTILITY_TERMS)) score += 5;
  if (bucket === "marketplace") score -= 20;
  if (textIncludes(text, CONSUMER_TERMS)) score -= 15;
  if (textIncludes(text, COMPLIANCE_TERMS)) score -= 15;
  return round(clamp(score, 0, 100));
}

function roi(startup: NormalizedStartup, text: string, avgMrr: number | null, isB2B: boolean, bucket: CategoryBucket): number {
  const arpu = logScore(avgMrr ?? 0, 1000) * 0.3;
  const rpv = logScore(startup.revenuePerVisitor ?? 0, 25) * 0.2;
  const margin = clamp(startup.profitMarginLast30Days ?? 50, 0, 100) * 0.15;
  const growth = clamp(((startup.growthMRR30d ?? 0) / 1000) * 100, 0, 100) * 0.1;
  const b2b = (isB2B ? 100 : 40) * 0.1;
  const lowSub = ((startup.activeSubscriptions ?? 999999) <= 50 && (startup.mrrUsd ?? 0) >= 1000 ? 100 : 35) * 0.1;
  let category = 50;
  if (["analytics-reporting", "developer-tool", "api-first", "utility-tool", "marketing-automation"].includes(bucket)) category = 85;
  if (["marketplace", "consumer-app", "too-complex"].includes(bucket)) category = 15;
  if (textIncludes(text, ENTERPRISE_TERMS) || textIncludes(text, ["paid ads", "seo only", "unclear buyer"])) category -= 20;
  if ((startup.customers ?? 0) > 1000 && (avgMrr ?? 0) < 20) category -= 25;
  return round(clamp(arpu + rpv + margin + growth + b2b + lowSub + category * 0.05, 0, 100));
}

function buildEffort(text: string, bucket: CategoryBucket): number {
  let score = 5;
  if (["analytics-reporting", "api-first", "utility-tool", "content-tool", "ai-wrapper"].includes(bucket)) score = 3;
  if (textIncludes(text, ["calculator", "converter", "template", "pdf", "chrome extension"])) score = 2;
  if (textIncludes(text, ["dashboard", "reporting", "automation", "api wrapper"])) score = Math.min(score, 3);
  if (textIncludes(text, ["real-time", "collaboration", "desktop app", "mobile-first", "ad platform", "recruiting"])) score = Math.max(score, 7);
  if (bucket === "marketplace" || bucket === "too-complex" || textIncludes(text, COMPLIANCE_TERMS)) score = Math.max(score, 8);
  if (textIncludes(text, ["hardware", "iot", "social network"])) score = 10;
  return score;
}

function distributionDifficulty(text: string, isB2B: boolean, bucket: CategoryBucket): number {
  let score = isB2B ? 4 : 7;
  if (textIncludes(text, ["agency", "developer", "shopify", "marketer", "accountant", "founder"])) score -= 2;
  if (bucket === "marketplace" || textIncludes(text, ["viral", "paid ads", "seo-only", "consumer"])) score += 3;
  if (textIncludes(text, ENTERPRISE_TERMS)) score += 2;
  return clamp(score, 1, 10);
}

function manualValidation(text: string, bucket: CategoryBucket): number {
  let score = 45;
  if (textIncludes(text, MANUAL_TERMS)) score = 90;
  if (["analytics-reporting", "content-tool", "marketing-automation", "utility-tool"].includes(bucket)) score = Math.max(score, 75);
  if (["marketplace", "consumer-app", "too-complex"].includes(bucket) || textIncludes(text, COMPLIANCE_TERMS)) score = Math.min(score, 25);
  return score;
}

function bucketFor(startup: NormalizedStartup, text: string, isHighTicket: boolean): CategoryBucket {
  if (textIncludes(text, MARKETPLACE_TERMS)) return "marketplace";
  if (textIncludes(text, COMPLIANCE_TERMS)) return "too-complex";
  if (textIncludes(text, ["developer", "devtool", "code", "github", "api client"])) return "developer-tool";
  if (textIncludes(text, ["api", "webhook", "sdk"])) return "api-first";
  if (textIncludes(text, ["analytics", "report", "dashboard", "metrics", "monitoring"])) return "analytics-reporting";
  if (textIncludes(text, ["marketing", "email", "campaign", "lead", "outreach", "automation"])) return "marketing-automation";
  if (textIncludes(text, ["ai", "gpt", "llm"])) return "ai-wrapper";
  if (textIncludes(text, ["content", "writer", "video", "image", "copy"])) return "content-tool";
  if (textIncludes(text, ["utility", "calculator", "converter", "pdf", "template", "extension"])) return "utility-tool";
  if (textIncludes(text, CONSUMER_TERMS)) return "consumer-app";
  if (isHighTicket && (startup.activeSubscriptions ?? 999999) <= 50) return "high-ticket-low-customer";
  if ((startup.customers ?? 0) > 500 || (startup.activeSubscriptions ?? 0) > 500) return "low-ticket-high-volume";
  return "unknown";
}

function rejectionFlagsFor(text: string, startup: NormalizedStartup, bucket: CategoryBucket): string[] {
  const flags: string[] = [];
  if (bucket === "marketplace") flags.push("marketplace/network effects");
  if (bucket === "too-complex") flags.push("regulated or compliance-heavy");
  if (bucket === "consumer-app") flags.push("consumer distribution risk");
  if (textIncludes(text, ENTERPRISE_TERMS)) flags.push("enterprise sales risk");
  if ((startup.customers ?? 0) > 1000 && (startup.mrrUsd ?? 0) < 2000) flags.push("many small customers");
  if (!startup.targetAudience) flags.push("unclear buyer");
  return flags;
}

function notesFor(startup: NormalizedStartup, bucket: CategoryBucket, avgMrr: number | null, isB2B: boolean, manualScore: number): string[] {
  const notes: string[] = [];
  if (avgMrr !== null && avgMrr >= 100) notes.push("pricing power signal");
  if (startup.founderCount === 1) notes.push("likely solo founder");
  if (startup.founderCount === 2) notes.push("tiny-team proxy");
  if (isB2B) notes.push("clearer B2B buyer signal");
  if (manualScore >= 75) notes.push("can likely be validated manually first");
  notes.push(`category bucket: ${bucket}`);
  return notes;
}
