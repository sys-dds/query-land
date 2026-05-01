import type { QueryLog, ResearchQueueRow, ScoredStartup } from "./types.js";
import { formatNullable, formatUsd, writeText } from "./utils.js";

const CSV_COLUMNS = [
  "rank",
  "name",
  "slug",
  "website",
  "category",
  "categoryBucket",
  "targetAudience",
  "country",
  "last30DaysUsd",
  "mrrUsd",
  "totalRevenueUsd",
  "customers",
  "activeSubscriptions",
  "avgMrrPerActiveSubUsd",
  "avgRevenuePerCustomerUsd",
  "visitorsLast30Days",
  "revenuePerVisitor",
  "growth30d",
  "growthMRR30d",
  "profitMarginLast30Days",
  "founderCount",
  "hasKnownFounderData",
  "xHandle",
  "xFollowerCount",
  "techStack",
  "isB2B",
  "isHighTicket",
  "isLowCustomerHighRevenue",
  "isLowTrafficHighRevenue",
  "likelySoloOrTinyTeam",
  "revenueScore",
  "soloLikelihoodScore",
  "roiScore",
  "buildEffortScore",
  "buildEaseScore",
  "distributionDifficultyScore",
  "manualValidationScore",
  "finalOpportunityScore",
  "rejectionFlags",
  "opportunityNotes",
  "description"
] as const;

export async function writeRankedCsv(path: string, startups: ScoredStartup[]): Promise<void> {
  const rows = startups.map((startup, index) => rowForStartup(startup, index + 1));
  await writeText(path, toCsv([CSV_COLUMNS, ...rows]));
}

export async function writeResearchQueueCsv(path: string, rows: ResearchQueueRow[]): Promise<void> {
  const headers = Object.keys(rows[0] ?? {
    priorityRank: "",
    name: "",
    website: "",
    category: "",
    mrrUsd: "",
    last30DaysUsd: "",
    finalOpportunityScore: "",
    whyResearchThis: "",
    googleSearchQuery: "",
    competitorSearchQuery: "",
    pricingSearchQuery: "",
    founderSearchQuery: "",
    linkedinSearchQuery: "",
    productHuntSearchQuery: "",
    redditSearchQuery: "",
    alternativeToSearchQuery: ""
  });
  const body = rows.map((row) => headers.map((header) => formatNullable(row[header as keyof ResearchQueueRow])));
  await writeText(path, toCsv([headers, ...body]));
}

export async function writeTopOpportunities(path: string, startups: ScoredStartup[], topN: number): Promise<void> {
  const lines = [
    "# Top 50 TrustMRR Opportunities",
    "",
    "> Warning: founderCount is only a proxy from TrustMRR cofounder data, not confirmed employee count. Missing founder data is not proof of solo-founder status.",
    ""
  ];

  startups.slice(0, topN).forEach((startup, index) => {
    const name = startup.name ?? startup.slug;
    lines.push(`## ${index + 1}. ${name}`);
    lines.push("");
    lines.push(`- Website: ${startup.website ?? "unknown"}`);
    lines.push(`- Category: ${startup.category ?? "unknown"} (${startup.categoryBucket})`);
    lines.push(`- Target audience: ${startup.targetAudience ?? "unknown"}`);
    lines.push(`- MRR: ${formatUsd(startup.mrrUsd)}`);
    lines.push(`- Last 30 days revenue: ${formatUsd(startup.last30DaysUsd)}`);
    lines.push(`- Active subscriptions: ${startup.activeSubscriptions ?? "unknown"}`);
    lines.push(`- Avg MRR per active subscription: ${formatUsd(startup.avgMrrPerActiveSubUsd)}`);
    lines.push(`- Founder count: ${startup.founderCount ?? "unknown"}`);
    lines.push(`- Top reason it ranks highly: ${startup.opportunityNotes[0] ?? "balanced score across ROI and build feasibility"}`);
    lines.push(`- Why people likely pay: ${whyPay(startup)}`);
    lines.push(`- Solo-dev copy angle: ${copyAngle(startup)}`);
    lines.push(`- What not to copy: ${whatNotToCopy(startup)}`);
    lines.push(`- Build effort estimate: ${labelLowMediumHigh(startup.buildEffortScore, true)}`);
    lines.push(`- Distribution difficulty: ${labelLowMediumHigh(startup.distributionDifficultyScore, true)}`);
    lines.push(`- Risks: ${startup.rejectionFlags.join("; ") || "Needs competitor and buyer validation."}`);
    lines.push("- Research queries to run next:");
    for (const query of researchQueries(startup)) lines.push(`  - ${query}`);
    lines.push("");
  });

  await writeText(path, `${lines.join("\n")}\n`);
}

export async function writeResearchSummary(path: string, startups: ScoredStartup[], queryLogs: QueryLog[], detailsFetched: number, failedDetails: number): Promise<void> {
  const top = startups.slice(0, 10);
  const failedQueries = queryLogs.filter((query) => query.error || query.itemsCollected === 0);
  const lines = [
    "# TrustMRR Research Summary",
    "",
    "## A. Executive summary",
    "",
    `- Highest ROI category patterns: ${topPatterns(startups, "roiScore").join(", ") || "unknown"}`,
    `- Strongest solo-SaaS signals: ${topPatterns(startups, "soloLikelihoodScore").join(", ") || "unknown"}`,
    `- Weakest categories to avoid: ${avoidCategories(startups).join(", ") || "none identified"}`,
    "",
    "## B. TrustMRR search strategy",
    "",
    "- Filters used: minMrr=100000, maxMrr=1000000 for achievable reference passes; uncapped high-revenue passes with minMrr=100000.",
    "- Sorts used: revenue-desc, growth-desc, newest.",
    "- Category queries used: saas, developer-tools, devtools, productivity, analytics, ai, ai-tools, marketing, utilities, automation, ecommerce, e-commerce, content, content-creation.",
    `- Pages fetched: ${queryLogs.reduce((sum, query) => sum + query.pagesFetched, 0)}`,
    `- Total startups collected: ${queryLogs.reduce((sum, query) => sum + query.itemsCollected, 0)}`,
    `- Total after dedupe: ${startups.length}`,
    `- Total details fetched: ${detailsFetched}`,
    `- Failed detail requests: ${failedDetails}`,
    `- Failed or empty queries: ${failedQueries.length === 0 ? "none" : failedQueries.map((query) => `${query.name}${query.error ? ` (${query.error})` : " (no data)"}`).join("; ")}`,
    "",
    section("C. Top 10 by MRR", by(startups, "mrrUsd")),
    section("D. Top 10 by last 30 days revenue", by(startups, "last30DaysUsd")),
    section("E. Top 10 by solo likelihood", by(startups, "soloLikelihoodScore")),
    section("F. Top 10 by ROI", by(startups, "roiScore")),
    section("G. Top 10 by low build effort", [...startups].sort((a, b) => a.buildEffortScore - b.buildEffortScore)),
    section("H. Top 10 final opportunities", startups),
    "## I. Categories to avoid",
    "",
    ...avoidCategories(startups).map((category) => `- ${category}: tends to imply higher build effort, harder distribution, network effects, or heavier compliance.`),
    "",
    "## J. Data limitations",
    "",
    "- TrustMRR does not confirm staff count.",
    "- Cofounders are only a proxy, not confirmed employee count.",
    "- Competitor research still needs external verification.",
    "- Revenue data depends on TrustMRR accuracy.",
    "- Build effort is heuristic, not fact.",
    "- Missing founder data is not proof of solo-founder status.",
    ""
  ];

  await writeText(path, `${lines.join("\n")}\n`);
}

export async function writeChatGptBrief(path: string, startups: ScoredStartup[]): Promise<void> {
  const lines = [
    "# ChatGPT Brief: TrustMRR Opportunity Radar",
    "",
    "Use this brief to continue competitor and build-choice research. Founder count is a proxy from TrustMRR cofounder data, not confirmed employee count.",
    "",
    "## Top 30 ranked products",
    "",
    "| Rank | Product | Category | MRR | 30d revenue | Active subs | Avg MRR/sub | ROI | Solo | Build effort | Final |",
    "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...startups.slice(0, 30).map((startup, index) =>
      `| ${index + 1} | ${startup.name ?? startup.slug} | ${startup.category ?? startup.categoryBucket} | ${formatUsd(startup.mrrUsd)} | ${formatUsd(startup.last30DaysUsd)} | ${startup.activeSubscriptions ?? ""} | ${formatUsd(startup.avgMrrPerActiveSubUsd)} | ${startup.roiScore} | ${startup.soloLikelihoodScore} | ${startup.buildEffortScore}/10 | ${startup.finalOpportunityScore} |`
    ),
    "",
    "## Scoring explanation",
    "",
    "- finalOpportunityScore = ROI 35%, solo likelihood 20%, build ease 15%, manual validation 15%, revenue 10%, inverse distribution difficulty 5%.",
    "- ROI rewards pricing power, revenue per visitor, margin, growth, B2B buyers, and meaningful MRR with fewer subscriptions.",
    "- Build effort and distribution difficulty are heuristic estimates, not facts.",
    "",
    "## Research questions",
    "",
    "1. Which competitors already serve this exact buyer and use case?",
    "2. Is the team actually solo/tiny based on public sources?",
    "3. What does pricing reveal about willingness to pay?",
    "4. Is there a narrower version a solo developer can build in 1-2 weeks?",
    "5. Can the first paid version be delivered manually before building full automation?",
    "",
    "## What I want ChatGPT to do next",
    "",
    "1. Verify competitors.",
    "2. Estimate staff/team size from public sources.",
    "3. Compare pricing.",
    "4. Identify market gaps.",
    "5. Recommend top 3 builds.",
    ""
  ];

  await writeText(path, `${lines.join("\n")}\n`);
}

function rowForStartup(startup: ScoredStartup, rank: number): string[] {
  return CSV_COLUMNS.map((column) => {
    if (column === "rank") return String(rank);
    if (column === "techStack") return startup.techStack.join("; ");
    if (column === "rejectionFlags") return startup.rejectionFlags.join("; ");
    if (column === "opportunityNotes") return startup.opportunityNotes.join("; ");
    return formatNullable(startup[column]);
  });
}

function toCsv(rows: readonly (readonly unknown[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const text = formatNullable(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function by(startups: ScoredStartup[], key: keyof ScoredStartup): ScoredStartup[] {
  return [...startups].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0));
}

function section(title: string, startups: ScoredStartup[]): string {
  const lines = [`## ${title}`, ""];
  startups.slice(0, 10).forEach((startup, index) => {
    lines.push(`${index + 1}. ${startup.name ?? startup.slug} - MRR ${formatUsd(startup.mrrUsd)}, score ${startup.finalOpportunityScore}, bucket ${startup.categoryBucket}`);
  });
  lines.push("");
  return lines.join("\n");
}

function topPatterns(startups: ScoredStartup[], key: "roiScore" | "soloLikelihoodScore"): string[] {
  const counts = new Map<string, number>();
  for (const startup of [...startups].sort((a, b) => b[key] - a[key]).slice(0, 25)) {
    counts.set(startup.categoryBucket, (counts.get(startup.categoryBucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([bucket]) => bucket);
}

function avoidCategories(startups: ScoredStartup[]): string[] {
  const buckets = new Set(startups.flatMap((startup) => startup.rejectionFlags.length > 0 ? [startup.categoryBucket] : []));
  return [...buckets].filter((bucket) => ["marketplace", "consumer-app", "too-complex", "low-ticket-high-volume"].includes(bucket));
}

function whyPay(startup: ScoredStartup): string {
  if (startup.isHighTicket) return "The product appears to solve a specific valuable problem with pricing power.";
  if (startup.isB2B) return "The buyer looks business-oriented, so the value can be tied to revenue, time, or workflow savings.";
  return "TrustMRR revenue suggests users pay, but the exact buying trigger needs validation.";
}

function copyAngle(startup: ScoredStartup): string {
  if (startup.manualValidationScore >= 75) return "Start with a narrow done-for-you report or audit, then automate repeated steps.";
  if (startup.categoryBucket === "developer-tool") return "Build a smaller developer utility around one painful workflow.";
  return "Copy the buyer/problem shape, not the entire product surface.";
}

function whatNotToCopy(startup: ScoredStartup): string {
  if (startup.rejectionFlags.length > 0) return startup.rejectionFlags.join("; ");
  return "Do not copy branding, private data, or broad feature scope before validating a narrower wedge.";
}

function labelLowMediumHigh(value: number, lowerIsBetter: boolean): "low" | "medium" | "high" {
  const normalized = lowerIsBetter ? value : 11 - value;
  if (normalized <= 3) return "low";
  if (normalized <= 6) return "medium";
  return "high";
}

function researchQueries(startup: ScoredStartup): string[] {
  const name = startup.name ?? startup.slug;
  const category = startup.category ?? startup.categoryBucket;
  return [
    `"${name}" pricing`,
    `"${name}" alternatives`,
    `"${name}" founder`,
    `"${name}" LinkedIn`,
    `"${name}" Product Hunt`,
    `"${name}" Reddit`,
    `site:reddit.com ${category} tool`,
    `"${category}" SaaS pricing competitors`
  ];
}
