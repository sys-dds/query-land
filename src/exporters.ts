import type { QueryLog, ResearchQueueRow, ScoredStartup } from "./types.js";
import { formatNullable, formatUsd, textIncludes, writeText } from "./utils.js";

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
  "rawMrr",
  "rawLast30DaysRevenue",
  "rawTotalRevenue",
  "totalRevenueUsd",
  "customers",
  "activeSubscriptions",
  "avgMrrPerActiveSubUsd",
  "avgRevenuePerCustomerUsd",
  "visitorsLast30Days",
  "revenuePerVisitor",
  "rawRevenuePerVisitor",
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
  "moneyScaleUsed",
  "moneyScaleConfidence",
  "possibleHundredXIssue",
  "moneyScaleWarnings",
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

export async function writeMoneyScaleAuditCsv(path: string, startups: ScoredStartup[]): Promise<void> {
  const headers = [
    "name",
    "slug",
    "rawMrr",
    "mrrUsd",
    "rawLast30DaysRevenue",
    "last30DaysUsd",
    "rawTotalRevenue",
    "totalRevenueUsd",
    "rawRevenuePerVisitor",
    "revenuePerVisitor",
    "activeSubscriptions",
    "avgMrrPerActiveSubUsd",
    "moneyScaleUsed",
    "moneyScaleConfidence",
    "possibleHundredXIssue",
    "moneyScaleWarnings"
  ];
  const rows = startups.map((startup) => [
    startup.name ?? startup.slug,
    startup.slug,
    startup.rawMrr,
    startup.mrrUsd,
    startup.rawLast30DaysRevenue,
    startup.last30DaysUsd,
    startup.rawTotalRevenue,
    startup.totalRevenueUsd,
    startup.rawRevenuePerVisitor,
    startup.revenuePerVisitor,
    startup.activeSubscriptions,
    startup.avgMrrPerActiveSubUsd,
    startup.moneyScaleUsed,
    startup.moneyScaleConfidence,
    startup.possibleHundredXIssue,
    startup.moneyScaleWarnings.join("; ")
  ]);
  await writeText(path, toCsv([headers, ...rows]));
}

export async function writeCleanOpportunityTableCsv(path: string, startups: ScoredStartup[]): Promise<void> {
  const headers = cleanColumns();
  const rows = startups.map((startup, index) => cleanRow(startup, index + 1));
  await writeText(path, toCsv([headers, ...rows]));
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

export async function writeResearchSummary(path: string, startups: ScoredStartup[], queryLogs: QueryLog[], detailsFetched: number, failedDetails: number, moneyScaleMode: string): Promise<void> {
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
    "- Filters used: configured minMrr/maxMrr range for configured-range passes; uncapped high-revenue passes with minMrr from config.",
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
    "## Money scaling audit",
    "",
    `- Configured TRUSTMRR_MONEY_SCALE: ${moneyScaleMode}`,
    `- Count using cents: ${startups.filter((startup) => startup.moneyScaleUsed === "cents").length}`,
    `- Count using dollars: ${startups.filter((startup) => startup.moneyScaleUsed === "dollars").length}`,
    `- Count unknown: ${startups.filter((startup) => startup.moneyScaleUsed === "unknown" || startup.moneyScaleUsed === null).length}`,
    `- Count possible hundred-x issues: ${startups.filter((startup) => startup.possibleHundredXIssue).length}`,
    "",
    "Top suspicious records:",
    "",
    ...topSuspicious(startups).map((startup, index) => `${index + 1}. ${startup.name ?? startup.slug} - rawMrr ${formatNullable(startup.rawMrr)}, MRR ${formatUsd(startup.mrrUsd)}, scale ${startup.moneyScaleUsed}, confidence ${startup.moneyScaleConfidence}, warnings ${startup.moneyScaleWarnings.join("; ") || "none"}`),
    ...(topSuspicious(startups).length === 0 ? ["- none"] : []),
    "",
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
  const anomalyWarning = startups.some((startup) => startup.possibleHundredXIssue)
    ? ["**Money scaling anomalies detected. Inspect latest/out/money-scale-audit.csv before trusting rankings.**", ""]
    : [];
  const lines = [
    "# ChatGPT Brief: TrustMRR Opportunity Radar",
    "",
    ...anomalyWarning,
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

export async function writeCleanOpportunityTableMd(path: string, startups: ScoredStartup[]): Promise<void> {
  const anomalies = startups.filter((startup) => startup.possibleHundredXIssue);
  const soloDev = bestSoloDev(startups);
  const willingness = highestWillingnessToPay(startups);
  const fastest = fastestMvpPath(startups);
  const easiestCustomers = easiestFirstCustomers(startups);
  const avoid = ideasToAvoid(startups);
  const lines = [
    "# Clean Opportunity Table",
    "",
    "## Money scaling warning",
    "",
    anomalies.length > 0
      ? `Money scaling anomalies detected in ${anomalies.length} record(s). Inspect latest/out/money-scale-audit.csv before trusting rankings.`
      : "No possible hundred-x money scaling anomalies were detected in this run.",
    "",
    "## Top opportunities",
    "",
    "| Rank | Product | Real MRR | 30d Rev | Subs | Avg/sub | Team | Buyer | Promise | Build | Distribution | Score |",
    "|---:|---|---:|---:|---:|---:|---|---|---|---|---|---:|",
    ...startups.slice(0, 30).map((startup, index) => cleanMdRow(startup, index + 1)),
    "",
    listSection("Best solo-dev opportunities", soloDev),
    listSection("Highest willingness to pay", willingness),
    listSection("Fastest MVP path", fastest),
    listSection("Easiest first 10 customers", easiestCustomers),
    "## Ideas to avoid",
    "",
    ...(avoid.length > 0
      ? avoid.map((startup) => `- ${startup.name ?? startup.slug}: ${startup.rejectionFlags.join("; ") || "high build/distribution risk"}; buyer ${buyerType(startup)}; build ${buildDifficulty(startup)}.`)
      : ["- none flagged"]),
    "",
    "Avoid patterns: lots of tiny customers, consumer apps needing volume, SEO-only commodity tools, marketplaces, heavy compliance, huge enterprise platforms, products requiring massive polish, and products with unclear buyer.",
    "",
    "## Best next analysis for ChatGPT",
    "",
    "Paste this report into ChatGPT and ask it to rank:",
    "1. best solo-dev opportunity",
    "2. highest willingness to pay",
    "3. fastest MVP path",
    "4. easiest first 10 customers",
    "5. ideas to avoid",
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
    if (column === "moneyScaleWarnings") return startup.moneyScaleWarnings.join("; ");
    return formatNullable(startup[column]);
  });
}

function cleanColumns(): string[] {
  return [
    "rank",
    "name",
    "website",
    "realMrrUsd",
    "last30DaysRevenueUsd",
    "activeSubscriptions",
    "avgMrrPerActiveSubUsd",
    "founderCount",
    "estimatedTeamSizeLabel",
    "category",
    "buyerType",
    "mainPromise",
    "buildDifficulty",
    "distributionChannel",
    "finalOpportunityScore",
    "roiScore",
    "manualValidationScore",
    "wedgePotentialScore",
    "cloneRiskScore",
    "moneyScaleUsed",
    "moneyScaleConfidence",
    "possibleHundredXIssue",
    "moneyScaleWarnings"
  ];
}

function cleanRow(startup: ScoredStartup, rank: number): string[] {
  return [
    rank,
    startup.name ?? startup.slug,
    startup.website,
    startup.mrrUsd,
    startup.last30DaysUsd,
    startup.activeSubscriptions,
    startup.avgMrrPerActiveSubUsd,
    startup.founderCount,
    estimatedTeamSizeLabel(startup),
    startup.category,
    buyerType(startup),
    mainPromise(startup),
    buildDifficulty(startup),
    distributionChannel(startup),
    startup.finalOpportunityScore,
    startup.roiScore,
    startup.manualValidationScore,
    "",
    "",
    startup.moneyScaleUsed,
    startup.moneyScaleConfidence,
    startup.possibleHundredXIssue,
    startup.moneyScaleWarnings.join("; ")
  ].map(formatNullable);
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

function topSuspicious(startups: ScoredStartup[]): ScoredStartup[] {
  return startups
    .filter((startup) => startup.possibleHundredXIssue || startup.moneyScaleConfidence === "low")
    .sort((a, b) => Number(b.possibleHundredXIssue) - Number(a.possibleHundredXIssue) || (b.rawMrr ?? 0) - (a.rawMrr ?? 0))
    .slice(0, 20);
}

function cleanMdRow(startup: ScoredStartup, rank: number): string {
  return [
    rank,
    startup.name ?? startup.slug,
    formatUsd(startup.mrrUsd),
    formatUsd(startup.last30DaysUsd),
    startup.activeSubscriptions ?? "",
    formatUsd(startup.avgMrrPerActiveSubUsd),
    estimatedTeamSizeLabel(startup),
    buyerType(startup),
    mainPromise(startup),
    buildDifficulty(startup),
    distributionChannel(startup),
    startup.finalOpportunityScore
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |");
}

function listSection(title: string, startups: ScoredStartup[]): string {
  const lines = [`## ${title}`, ""];
  if (startups.length === 0) {
    lines.push("- none");
  } else {
    startups.slice(0, 10).forEach((startup, index) => {
      lines.push(`${index + 1}. ${startup.name ?? startup.slug} - ${formatUsd(startup.mrrUsd)} MRR, ${buyerType(startup)}, ${mainPromise(startup)}, build ${buildDifficulty(startup)}, score ${startup.finalOpportunityScore}.`);
    });
  }
  lines.push("");
  return lines.join("\n");
}

function bestSoloDev(startups: ScoredStartup[]): ScoredStartup[] {
  const goodConfidence = startups.some((startup) => startup.moneyScaleConfidence !== "low" && !startup.possibleHundredXIssue);
  return startups
    .filter((startup) => startup.buildEffortScore < 8)
    .filter((startup) => !startup.rejectionFlags.some((flag) => flag.includes("consumer") || flag.includes("marketplace")))
    .filter((startup) => !goodConfidence || (startup.moneyScaleConfidence !== "low" && !startup.possibleHundredXIssue))
    .sort((a, b) => b.finalOpportunityScore - a.finalOpportunityScore);
}

function highestWillingnessToPay(startups: ScoredStartup[]): ScoredStartup[] {
  return [...startups].sort((a, b) => willingnessScore(b) - willingnessScore(a));
}

function fastestMvpPath(startups: ScoredStartup[]): ScoredStartup[] {
  return [...startups].sort((a, b) => fastMvpScore(b) - fastMvpScore(a));
}

function easiestFirstCustomers(startups: ScoredStartup[]): ScoredStartup[] {
  return [...startups].sort((a, b) => customerReachScore(b) - customerReachScore(a));
}

function ideasToAvoid(startups: ScoredStartup[]): ScoredStartup[] {
  return startups.filter((startup) => startup.rejectionFlags.length > 0 || startup.buildEffortScore >= 8 || buyerType(startup) === "consumer");
}

function willingnessScore(startup: ScoredStartup): number {
  const b2b = ["SaaS", "agency", "ecommerce", "developer", "marketing", "sales", "finance", "healthcare"].includes(buyerType(startup)) ? 20 : 0;
  const promise = ["get leads", "increase conversion", "prove ad ROI", "recover revenue", "developer productivity"].includes(mainPromise(startup)) ? 20 : 0;
  return (startup.avgMrrPerActiveSubUsd ?? 0) + b2b + promise - (startup.activeSubscriptions ?? 9999) / 100;
}

function fastMvpScore(startup: ScoredStartup): number {
  return startup.manualValidationScore + (10 - startup.buildEffortScore) * 10 + (10 - startup.distributionDifficultyScore) * 5;
}

function customerReachScore(startup: ScoredStartup): number {
  const channel = distributionChannel(startup);
  const channelScore = ["cold outbound", "community", "direct sales", "agency partnerships", "open-source"].includes(channel) ? 30 : channel === "SEO" ? 5 : 15;
  const buyerScore = buyerType(startup) === "unknown" || buyerType(startup) === "consumer" ? 0 : 25;
  return channelScore + buyerScore + startup.roiScore + (startup.isHighTicket ? 20 : 0);
}

function estimatedTeamSizeLabel(startup: ScoredStartup): string {
  if (startup.founderCount === 1) return "likely solo";
  if (startup.founderCount === 2) return "tiny team proxy";
  if (startup.founderCount !== null && startup.founderCount > 2) return "less solo-friendly proxy";
  return "unknown";
}

function buildDifficulty(startup: ScoredStartup): string {
  if (startup.buildEffortScore <= 3) return "easy";
  if (startup.buildEffortScore <= 5) return "medium";
  if (startup.buildEffortScore <= 7) return "hard";
  return "avoid";
}

function buyerType(startup: ScoredStartup): string {
  const text = searchable(startup);
  if (textIncludes(text, ["health", "medical", "clinic"])) return "healthcare";
  if (textIncludes(text, ["finance", "accounting", "bookkeeping", "payment", "fintech"])) return "finance";
  if (textIncludes(text, ["school", "student", "teacher", "course", "education"])) return "education";
  if (textIncludes(text, ["developer", "devtool", "api", "github", "code"])) return "developer";
  if (textIncludes(text, ["agency", "client"])) return "agency";
  if (textIncludes(text, ["shopify", "ecommerce", "e-commerce", "store"])) return "ecommerce";
  if (textIncludes(text, ["creator", "newsletter", "video", "podcast", "influencer"])) return "creator";
  if (textIncludes(text, ["marketing", "ads", "campaign", "seo"])) return "marketing";
  if (textIncludes(text, ["sales", "lead", "outbound", "crm"])) return "sales";
  if (textIncludes(text, ["restaurant", "local business", "salon", "practice"])) return "local-business";
  if (textIncludes(text, ["consumer", "mobile", "dating", "game", "social"])) return "consumer";
  if (textIncludes(text, ["saas", "business", "b2b", "team"])) return "SaaS";
  return "unknown";
}

function mainPromise(startup: ScoredStartup): string {
  const text = searchable(startup);
  if (textIncludes(text, ["lead", "prospect", "outbound"])) return "get leads";
  if (textIncludes(text, ["conversion", "landing page", "checkout"])) return "increase conversion";
  if (textIncludes(text, ["churn", "retention"])) return "reduce churn";
  if (textIncludes(text, ["ad roi", "attribution", "roas"])) return "prove ad ROI";
  if (textIncludes(text, ["save time", "automate", "workflow"])) return "save time";
  if (textIncludes(text, ["content", "post", "copy", "video"])) return "automate content";
  if (textIncludes(text, ["analytics", "dashboard", "report", "metrics"])) return "improve analytics";
  if (textIncludes(text, ["recover", "abandoned", "refund", "chargeback"])) return "recover revenue";
  if (textIncludes(text, ["support", "ticket", "helpdesk"])) return "reduce support";
  if (textIncludes(text, ["seo", "search"])) return "improve SEO";
  if (textIncludes(text, ["operations", "manage", "schedule", "admin"])) return "manage operations";
  if (textIncludes(text, ["developer", "api", "code", "deploy"])) return "developer productivity";
  if (textIncludes(text, ["compliance", "risk", "security", "legal"])) return "compliance/risk";
  return "unknown";
}

function distributionChannel(startup: ScoredStartup): string {
  const text = searchable(startup);
  const buyer = buyerType(startup);
  if (textIncludes(text, ["marketplace", "shopify app", "app store"])) return "marketplace";
  if (textIncludes(text, ["open source", "github"])) return "open-source";
  if (textIncludes(text, ["community", "discord", "slack"])) return "community";
  if (textIncludes(text, ["agency"])) return "agency partnerships";
  if (textIncludes(text, ["seo", "search"])) return "SEO";
  if (textIncludes(text, ["ads", "paid"])) return "ads";
  if (textIncludes(text, ["social", "content", "creator"])) return "social/content";
  if (["SaaS", "agency", "developer", "marketing", "sales", "local-business"].includes(buyer)) return "cold outbound";
  if (startup.isB2B || startup.isHighTicket) return "direct sales";
  if (textIncludes(text, ["self serve", "product-led", "free trial"])) return "product-led";
  return "unknown";
}

function searchable(startup: ScoredStartup): string {
  return [startup.name, startup.category, startup.targetAudience, startup.description, startup.categoryBucket, startup.opportunityNotes.join(" "), startup.rejectionFlags.join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
