import type { QueryLog, ResearchQueueRow, ScoredStartup } from "./types.js";
import { formatNullable, formatUsd, textIncludes, writeText } from "./utils.js";

type ChatGptBriefContext = {
  generatedAt: Date;
  topN: number;
  moneyScaleMode: string;
  queryLogs: QueryLog[];
  detailsFetched: number;
  failedDetails: number;
  runId?: string;
  runFolder?: string;
  latestFolder?: string;
};

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

export async function writeChatGptBrief(path: string, startups: ScoredStartup[], context: ChatGptBriefContext): Promise<void> {
  const failedQueries = context.queryLogs.filter((query) => query.error || query.itemsCollected === 0);
  const top = startups.slice(0, 30);
  const topTen = startups.slice(0, 10);
  const anomalies = topSuspicious(startups);
  const marketStudy = startups.filter((startup) => studyVsBuildClassification(startup) === "market-study").slice(0, 8);
  const lines = [
    "# ChatGPT Decision Brief: TrustMRR Opportunity Radar",
    "",
    "## 1. Run context",
    "",
    `- Generated at: ${context.generatedAt.toISOString()}`,
    `- Product count: ${startups.length}`,
    `- Top N: ${context.topN}`,
    `- Money scale mode: ${context.moneyScaleMode}`,
    `- Possible money-scale anomaly count: ${startups.filter((startup) => startup.possibleHundredXIssue).length}`,
    `- Query count: ${context.queryLogs.length}`,
    `- Successful queries: ${context.queryLogs.length - failedQueries.length}`,
    `- Failed/empty queries: ${failedQueries.length}`,
    `- Detail records fetched: ${context.detailsFetched}`,
    `- Detail failures: ${context.failedDetails}`,
    ...(context.runId ? [`- Run ID: ${context.runId}`] : []),
    ...(context.runFolder ? [`- Run folder: ${context.runFolder}`] : []),
    ...(context.latestFolder ? [`- Latest folder: ${context.latestFolder}`] : []),
    "- Source note: this is based on TrustMRR only; no online company verification has been run yet.",
    "",
    "## 2. What this data can and cannot prove",
    "",
    "- TrustMRR revenue is useful but should be treated as directional.",
    "- Money scaling is audited, but obvious anomalies can still exist and should be manually ignored.",
    "- founderCount is only a TrustMRR cofounder/founder proxy, not verified employee count.",
    "- No online company-size verification has been run yet.",
    "- Buyer type, promise, distribution, and build difficulty are heuristic classifications.",
    "- Final business decision still needs competitor/team-size validation.",
    "",
    "## 3. Executive summary",
    "",
    ...executiveSummary(startups),
    "",
    "The best opportunities are not necessarily the highest-MRR products. The best solo-dev target is usually a smaller wedge inside a proven revenue-adjacent B2B category.",
    "",
    "## 4. Top 30 opportunity table",
    "",
    "| Rank | Product | MRR | 30d Rev | Subs | Avg/sub | Team proxy | Buyer | Promise | Build | Distribution | Score |",
    "|---:|---|---:|---:|---:|---:|---|---|---|---|---|---:|",
    ...top.map((startup, index) => decisionTableRow(startup, index + 1)),
    "",
    "## 5. Best by lens",
    "",
    lensSection("Best ROI", topByLens(startups, "roi")),
    lensSection("Highest MRR", topByLens(startups, "mrr")),
    lensSection("Highest willingness to pay", topByLens(startups, "willingness")),
    lensSection("Best solo-fit proxy", topByLens(startups, "solo")),
    lensSection("Fastest MVP path", topByLens(startups, "fastest")),
    lensSection("Easiest first 10 customers", topByLens(startups, "customers")),
    "## 6. Market pattern summary",
    "",
    ...marketPatternSummary(startups),
    "",
    "## 7. Study vs build classification",
    "",
    "Do not remove anomalous rows entirely. The AI reviewer should ignore obvious anomalies manually.",
    "",
    "| Product | Classification | Reason |",
    "|---|---|---|",
    ...classificationRows(startups),
    "",
    "## 8. Big product → smaller solo wedge",
    "",
    ...smallerWedgeSuggestions(marketStudy.length > 0 ? marketStudy : startups.slice(0, 8)),
    "",
    "## 9. Top 10 detailed opportunity notes",
    "",
    ...topTen.flatMap((startup, index) => detailedOpportunityNotes(startup, index + 1)),
    "## 10. Ideas and patterns to avoid",
    "",
    ...ideasAndPatternsToAvoid(startups),
    "",
    "Do not automatically copy the biggest product. Copy the buyer pain and build a narrower wedge.",
    "",
    "## 11. Best current build directions from this run",
    "",
    ...buildDirectionSuggestions(startups),
    "",
    "## 12. Current best hypothesis",
    "",
    ...currentBestHypothesis(startups),
    "",
    "## 13. Exact instruction for ChatGPT / AI reviewer",
    "",
    "Use this brief to help me choose a realistic one-person SaaS / micro-SaaS opportunity.",
    "",
    "Do not give generic startup advice.",
    "",
    "First, ignore obvious data anomalies manually.",
    "",
    "Then rank:",
    "1. best solo-dev opportunity",
    "2. highest willingness to pay",
    "3. fastest MVP path",
    "4. easiest first 10 customers",
    "5. ideas to avoid",
    "",
    "Then pick:",
    "- top 5 opportunities to investigate",
    "- top 3 serious builds",
    "- single best idea",
    "",
    "Prioritize:",
    "- B2B",
    "- clear ROI",
    "- high ARPU",
    "- reachable customers",
    "- manual-first validation",
    "- realistic $1k MRR with 1–10 customers",
    "",
    "Penalize:",
    "- consumer volume plays",
    "- SEO-only dependency",
    "- marketplaces",
    "- heavy compliance",
    "- enterprise-only sales",
    "- products needing huge polish",
    "- products with unverified team size",
    "- products with suspicious money data",
    "",
    "Finally, propose:",
    "- a 30-day validation plan",
    "- first paid offer",
    "- first 20 customer sources",
    "- what not to build yet",
    ""
  ];

  await writeText(path, `${lines.join("\n")}\n`);
}

function executiveSummary(startups: ScoredStartup[]): string[] {
  const topFinal = startups.slice(0, 15);
  const productsToStudy = topFinal.slice(0, 5).map(nameOf).join(", ") || "none";
  const smallerWedges = uniqueTop(startups, (startup) => wedgeFor(startup).smallerWedge, 5).join("; ");
  const avoid = ideasToAvoid(startups).slice(0, 5).map((startup) => `${nameOf(startup)} (${startup.rejectionFlags[0] ?? buildDifficulty(startup)})`).join(", ") || "none obvious";
  const lines = [
    `- Strongest opportunity pattern: ${dominant(topFinal, (startup) => `${mainPromise(startup)} for ${buyerType(startup)}`)}.`,
    `- Strongest buyer types: ${uniqueTop(topFinal, buyerType, 5).join(", ") || "unknown"}.`,
    `- Strongest promises: ${uniqueTop(topFinal, mainPromise, 6).join(", ") || "unknown"}.`,
    `- Strongest products to study: ${productsToStudy}.`,
    `- Strongest smaller-wedge directions: ${smallerWedges || "narrow B2B reporting, lead generation, conversion, and content workflows"}.`,
    `- Biggest avoid patterns: ${avoid}.`
  ];
  return lines;
}

function decisionTableRow(startup: ScoredStartup, rank: number): string {
  return [
    rank,
    nameOf(startup),
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

type Lens = "roi" | "mrr" | "willingness" | "solo" | "fastest" | "customers";

function topByLens(startups: ScoredStartup[], lens: Lens): ScoredStartup[] {
  const usable = lens === "willingness" ? startups.filter((startup) => !obviousDataAnomaly(startup)) : startups;
  if (lens === "roi") return topBy(usable, (startup) => startup.roiScore);
  if (lens === "mrr") return topBy(usable, (startup) => startup.mrrUsd ?? 0);
  if (lens === "willingness") return topBy(usable, willingnessScore);
  if (lens === "solo") return topBy(usable, (startup) => startup.soloLikelihoodScore);
  if (lens === "fastest") return topBy(usable, fastMvpScore);
  return topBy(
    usable.filter((startup) => buyerType(startup) !== "unknown" && buyerType(startup) !== "consumer" && buildDifficulty(startup) !== "avoid"),
    customerReachScore
  );
}

function topBy(startups: ScoredStartup[], score: (startup: ScoredStartup) => number): ScoredStartup[] {
  return [...startups].sort((a, b) => score(b) - score(a)).slice(0, 10);
}

function lensSection(title: string, startups: ScoredStartup[]): string {
  const lines = [`### ${title}`, ""];
  if (startups.length === 0) {
    lines.push("- none");
  } else {
    startups.forEach((startup, index) => {
      lines.push(`${index + 1}. ${nameOf(startup)} - MRR ${formatUsd(startup.mrrUsd)}, avg/sub ${formatUsd(startup.avgMrrPerActiveSubUsd)}, buyer ${buyerType(startup)}, promise ${mainPromise(startup)}, build ${buildDifficulty(startup)} - ${reasonForLens(startup)}.`);
    });
  }
  lines.push("");
  return lines.join("\n");
}

function reasonForLens(startup: ScoredStartup): string {
  if (startup.possibleHundredXIssue) return "possible money-scale anomaly; treat manually";
  if ((startup.avgMrrPerActiveSubUsd ?? 0) >= 100) return "strong ARPU signal";
  if (startup.manualValidationScore >= 75 && startup.buildEffortScore <= 4) return "manual-first, low-build wedge";
  if (startup.roiScore >= 70) return "strong ROI scoring";
  if (startup.soloLikelihoodScore >= 75) return "solo/tiny-team proxy is favorable";
  return startup.opportunityNotes[0] ?? "balanced score across lenses";
}

function marketPatternSummary(startups: ScoredStartup[]): string[] {
  const nearTop = startups.slice(0, 30);
  const promises = ["get leads", "increase conversion", "prove ad ROI", "save time", "automate content", "recover revenue", "developer productivity"];
  const promiseLines = promises.map((promise) => `- ${promise}: ${nearTop.filter((startup) => mainPromise(startup) === promise).map(nameOf).slice(0, 4).join(", ") || "not prominent in top 30"}`);
  const examples = nearTop.slice(0, 10).map((startup) => `${nameOf(startup)} (${mainPromise(startup)})`).join(", ");
  return [
    `- Categories appearing most often near the top: ${countTop(nearTop, (startup) => startup.categoryBucket).join(", ") || "unknown"}.`,
    `- Strongest buyer types: ${countTop(nearTop, buyerType).join(", ") || "unknown"}.`,
    `- Strongest promises: ${countTop(nearTop, mainPromise).join(", ") || "unknown"}.`,
    "- Pattern checks:",
    ...promiseLines,
    "- When supported by the data, the strongest markets are attribution/ad ROI tools, trial/conversion/revenue-recovery tools, lead-gen/outbound tools, and content distribution tools.",
    `- Useful market examples, not direct clones: ${examples || "none"}.`
  ];
}

function classificationRows(startups: ScoredStartup[]): string[] {
  const selected = uniqueByName([
    ...startups.slice(0, 12),
    ...topByLens(startups, "willingness").slice(0, 5),
    ...ideasToAvoid(startups).slice(0, 5),
    ...topSuspicious(startups).slice(0, 5)
  ]).slice(0, 24);
  return selected.map((startup) => `| ${nameOf(startup)} | ${studyVsBuildClassification(startup)} | ${classificationReason(startup)} |`);
}

function studyVsBuildClassification(startup: ScoredStartup): "build-candidate" | "market-study" | "avoid" | "data-anomaly" | "needs-online-verification" {
  if (obviousDataAnomaly(startup)) return "data-anomaly";
  if (startup.rejectionFlags.some((flag) => flag.includes("marketplace") || flag.includes("consumer") || flag.includes("regulated"))) return "avoid";
  if (startup.buildEffortScore <= 5 && startup.manualValidationScore >= 70 && buyerType(startup) !== "unknown" && startup.distributionDifficultyScore <= 6) return "build-candidate";
  if ((startup.mrrUsd ?? 0) >= 5000 || startup.buildEffortScore >= 7) return "market-study";
  return "needs-online-verification";
}

function classificationReason(startup: ScoredStartup): string {
  const classification = studyVsBuildClassification(startup);
  if (classification === "data-anomaly") return `suspicious money data: ${startup.moneyScaleWarnings.join("; ") || startup.moneyScaleConfidence}`;
  if (classification === "avoid") return startup.rejectionFlags.join("; ") || "high-risk category";
  if (classification === "build-candidate") return `${buyerType(startup)} buyer, ${mainPromise(startup)} promise, ${buildDifficulty(startup)} build, reachable via ${distributionChannel(startup)}`;
  if (classification === "market-study") return "strong proof, but too broad or competitive to copy directly";
  return "promising but team size, pricing, and competitors still need public verification";
}

function smallerWedgeSuggestions(startups: ScoredStartup[]): string[] {
  const selected = uniqueByName(startups).slice(0, 8);
  if (selected.length === 0) return ["- none"];
  return selected.flatMap((startup) => {
    const wedge = wedgeFor(startup);
    return [
      `- Source: ${nameOf(startup)}`,
      `  - Proves: ${wedge.proves}`,
      `  - Smaller wedge: ${wedge.smallerWedge}`,
      `  - Do not copy: ${wedge.doNotCopy}`,
      `  - First paid offer: ${wedge.firstOffer}`
    ];
  });
}

function detailedOpportunityNotes(startup: ScoredStartup, rank: number): string[] {
  return [
    `### ${rank}. ${nameOf(startup)}`,
    "",
    `- Website: ${startup.website ?? "unknown"}`,
    `- MRR: ${formatUsd(startup.mrrUsd)}`,
    `- 30d revenue: ${formatUsd(startup.last30DaysUsd)}`,
    `- Active subscriptions: ${startup.activeSubscriptions ?? "unknown"}`,
    `- Avg MRR/sub: ${formatUsd(startup.avgMrrPerActiveSubUsd)}`,
    `- Buyer: ${buyerType(startup)}`,
    `- Promise: ${mainPromise(startup)}`,
    `- Build difficulty: ${buildDifficulty(startup)}`,
    `- Distribution: ${distributionChannel(startup)}`,
    `- Why people likely pay: ${whyPay(startup)}`,
    `- Solo-dev copy angle: ${copyAngle(startup)}`,
    `- What not to copy: ${whatNotToCopy(startup)}`,
    `- Risk: ${startup.rejectionFlags.join("; ") || classificationReason(startup)}`,
    `- Manual validation idea: ${manualValidationIdea(startup)}`,
    "- Research queries to run next:",
    ...researchQueries(startup).slice(0, 5).map((query) => `  - ${query}`),
    ""
  ];
}

function ideasAndPatternsToAvoid(startups: ScoredStartup[]): string[] {
  const suspicious = topSuspicious(startups).slice(0, 5).map(nameOf).join(", ") || "none obvious";
  return [
    `- Obvious data anomalies: ${suspicious}.`,
    "- Anonymous products with inconsistent money/customer numbers.",
    "- Consumer apps needing volume.",
    "- Marketplaces/network effects.",
    "- Heavy compliance/healthcare/fintech unless intentionally targeted.",
    "- Giant platforms as direct clone targets.",
    "- Generic AI wrappers.",
    "- SEO-only commodity tools.",
    "- Low-ticket high-support tools.",
    "- Unclear buyer products."
  ];
}

function buildDirectionSuggestions(startups: ScoredStartup[]): string[] {
  const directions = [
    direction("Stripe trial / conversion leak detector", startups, ["increase conversion", "recover revenue"], "Find failed trials, failed payments, churn spikes, or onboarding leaks from Stripe exports.", "SaaS founders", "$99-$299/mo or $299 audit/report"),
    direction("Ad attribution / ROAS reporting mini-tool", startups, ["prove ad ROI"], "Weekly ROAS anomaly report from ad spend and revenue exports.", "Shopify, DTC, and SaaS founders running ads", "$199-$499/mo or $299 audit/report"),
    direction("Niche outbound lead finder", startups, ["get leads"], "Manual-first list building for one vertical with enrichment and reason-to-contact notes.", "Agencies, consultants, and B2B founders", "$199-$500 per batch"),
    direction("Founder/agency content repurposing workflow", startups, ["automate content"], "Turn one video, call, or long post into channel-specific assets with review controls.", "Founders, creators, and small agencies", "$49-$199/mo"),
    direction("Weekly revenue/analytics anomaly report", startups, ["improve analytics", "save time"], "Email a concise weekly report on revenue, traffic, conversion, and churn anomalies.", "SaaS and ecommerce founders", "$99-$299/mo")
  ];
  return directions.flatMap((item) => [
    `### ${item.name}`,
    "",
    `- Why this pattern appears promising: ${item.why}`,
    `- Source products that inspired it: ${item.sources}`,
    `- First MVP wedge: ${item.mvp}`,
    `- Likely buyer: ${item.buyer}`,
    `- Likely price range hypothesis: ${item.price}`,
    "- Validation method: sell the report manually to 10-20 targeted buyers before building automation.",
    "- Verification needed: online competitor, team-size, and pricing checks.",
    ""
  ]);
}

function currentBestHypothesis(startups: ScoredStartup[]): string[] {
  const candidate = bestSoloDev(startups)[0] ?? startups[0];
  if (!candidate) return ["- Not enough scored data to form a hypothesis."];
  const wedge = wedgeFor(candidate);
  return [
    `- Best category to investigate: ${candidate.categoryBucket} / ${buyerType(candidate)} tools around "${mainPromise(candidate)}".`,
    `- Best solo-dev wedge: ${wedge.smallerWedge}.`,
    "- Why it may reach $1k MRR: a B2B buyer with clear ROI can plausibly reach this with 1-10 customers if the first paid offer proves useful.",
    "- What still needs verification: competitor density, public team size, real pricing, buyer reachability, and whether suspicious TrustMRR money data should be ignored.",
    "- This is based only on TrustMRR data and is not a final decision until online research is added."
  ];
}

function direction(name: string, startups: ScoredStartup[], promises: string[], mvp: string, buyer: string, price: string): { name: string; why: string; sources: string; mvp: string; buyer: string; price: string } {
  const sources = startups.filter((startup) => promises.includes(mainPromise(startup))).slice(0, 4);
  return {
    name,
    why: sources.length > 0 ? `${sources.length} top products point at this pain or adjacent buying trigger.` : "The scoring favors narrow B2B reporting/workflow wedges with manual validation potential.",
    sources: sources.map(nameOf).join(", ") || startups.slice(0, 3).map(nameOf).join(", ") || "none",
    mvp,
    buyer,
    price
  };
}

function wedgeFor(startup: ScoredStartup): { proves: string; smallerWedge: string; doNotCopy: string; firstOffer: string } {
  const promise = mainPromise(startup);
  if (promise === "prove ad ROI") return { proves: "attribution/ad ROI pain", smallerWedge: "weekly ROAS anomaly report for Shopify/SaaS founders", doNotCopy: "full attribution platform", firstOffer: "$299 audit/report" };
  if (promise === "increase conversion") return { proves: "conversion and funnel leak pain", smallerWedge: "checkout/trial leak report from Stripe and analytics exports", doNotCopy: "full CRO suite", firstOffer: "$199 funnel audit" };
  if (promise === "recover revenue") return { proves: "revenue leakage is worth paying for", smallerWedge: "failed payment or abandoned checkout recovery checklist/report", doNotCopy: "full billing platform", firstOffer: "$299 recovery setup" };
  if (promise === "get leads") return { proves: "lead supply and outbound targeting pain", smallerWedge: "niche lead list with reason-to-contact notes", doNotCopy: "horizontal lead database", firstOffer: "$250 lead batch" };
  if (promise === "automate content") return { proves: "content distribution workload pain", smallerWedge: "repurpose one source asset into a weekly LinkedIn/email pack", doNotCopy: "generic all-in-one AI content platform", firstOffer: "$199 content pack" };
  if (promise === "developer productivity") return { proves: "developers pay for workflow speed", smallerWedge: "one painful dev workflow checker, reporter, or CLI helper", doNotCopy: "full developer platform", firstOffer: "$19-$99/mo utility" };
  return { proves: `${promise} pain for ${buyerType(startup)} buyers`, smallerWedge: `manual-first ${promise} report for one narrow ${buyerType(startup)} segment`, doNotCopy: "the full product surface", firstOffer: "$99-$299 paid audit/report" };
}

function manualValidationIdea(startup: ScoredStartup): string {
  const wedge = wedgeFor(startup);
  return `Offer ${wedge.firstOffer} for ${wedge.smallerWedge} using manual data collection first.`;
}

function dominant(startups: ScoredStartup[], label: (startup: ScoredStartup) => string): string {
  return countTop(startups, label)[0] ?? "narrow B2B tools with clear ROI";
}

function uniqueTop(startups: ScoredStartup[], label: (startup: ScoredStartup) => string, limit: number): string[] {
  return countTop(startups, label).filter((item) => !item.startsWith("unknown")).slice(0, limit);
}

function countTop(startups: ScoredStartup[], label: (startup: ScoredStartup) => string): string[] {
  const counts = new Map<string, number>();
  for (const startup of startups) {
    const key = label(startup);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} (${count})`);
}

function uniqueByName(startups: ScoredStartup[]): ScoredStartup[] {
  const seen = new Set<string>();
  return startups.filter((startup) => {
    const name = nameOf(startup);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function nameOf(startup: ScoredStartup): string {
  return startup.name ?? startup.slug;
}

function obviousDataAnomaly(startup: ScoredStartup): boolean {
  const mrr = startup.mrrUsd ?? 0;
  const last30Days = startup.last30DaysUsd ?? 0;
  const avgSub = startup.avgMrrPerActiveSubUsd ?? 0;
  return startup.possibleHundredXIssue || startup.moneyScaleConfidence === "low" || avgSub >= 100000 || (mrr >= 10000000 && last30Days > 0 && mrr > last30Days * 100);
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
    .filter(obviousDataAnomaly)
    .sort((a, b) => Number(obviousDataAnomaly(b)) - Number(obviousDataAnomaly(a)) || (b.rawMrr ?? 0) - (a.rawMrr ?? 0))
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
