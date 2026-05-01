import { mkdir } from "node:fs/promises";
import { loadConfig, safeConfigSummary } from "./config.js";
import { writeChatGptBrief, writeRankedCsv, writeResearchQueueCsv, writeResearchSummary, writeTopOpportunities } from "./exporters.js";
import { createLogger, parseLogLevel, type Logger } from "./logger.js";
import { dedupeBySlug, normalizeStartup } from "./normalize.js";
import { OUTPUT_FILE_LIST, OUTPUT_FILES } from "./outputFiles.js";
import { buildResearchQueue } from "./researchQueue.js";
import { scoreStartups } from "./scoring.js";
import { formatParams, TrustMrrClient } from "./trustmrrClient.js";
import type { DetailLog, FetchQuery, QueryLog, RawOutput, UnknownRecord } from "./types.js";
import { asRecord, firstString, writeJson } from "./utils.js";

const CATEGORIES = [
  "saas",
  "developer-tools",
  "devtools",
  "productivity",
  "analytics",
  "ai",
  "ai-tools",
  "marketing",
  "utilities",
  "automation",
  "ecommerce",
  "e-commerce",
  "content",
  "content-creation"
];

async function main(): Promise<void> {
  const startedAt = new Date();
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.banner("TrustMRR Opportunity Radar");
  logger.info("Config:");
  for (const [key, value] of Object.entries(safeConfigSummary(config))) {
    logger.step(`- ${key}: ${value}`);
  }

  await ensureOutputDirs();

  const client = new TrustMrrClient(config, logger);
  const queries = buildQueries(config.minMrrCents, config.maxMrrCents);
  const rawItems: UnknownRecord[] = [];
  const rawPages: UnknownRecord[] = [];
  const queryLogs: QueryLog[] = [];

  logger.phase(`🔎 Fetching TrustMRR list queries (${queries.length} planned)`);
  for (const [index, query] of queries.entries()) {
    logger.info(`🔎 [${index + 1}/${queries.length}] ${query.name}`);
    logger.step(`Params: ${formatParams({ ...queryToSafeParams(query), limit: config.limit })}`);
    const result = await client.fetchQuery(query);
    rawItems.push(...result.items);
    rawPages.push(...result.rawPages);
    queryLogs.push(result.log);
    if (result.log.error) {
      logger.warn(`Query failed: ${query.name}`, {
        Params: formatParams(result.log.params),
        Error: result.log.error,
        Action: "continuing with remaining queries"
      });
    } else {
      logger.success(`Done: ${result.items.length} items across ${result.rawPages.length} pages`);
    }
  }

  const deduped = dedupeBySlug(rawItems);
  const detailBySlug: Record<string, UnknownRecord> = {};
  const detailLogs: DetailLog[] = [];

  if (config.fetchDetails) {
    logger.phase(`🔎 Fetching details for ${deduped.length} startups`);
    for (const [index, item] of deduped.entries()) {
      const slug = firstString(item.slug, item.handle, item.id);
      if (!slug) continue;
      try {
        if (logger.isDebug() || index === 0 || (index + 1) % 10 === 0 || index + 1 === deduped.length) {
          logger.progress(`[${index + 1}/${deduped.length}] ${slug}`);
        }
        const detail = await client.fetchDetail(slug);
        detailBySlug[slug] = detail;
        detailLogs.push({ slug, ok: true, error: null });
      } catch (caught) {
        const error = caught instanceof Error ? caught.message : "Unknown TrustMRR detail fetch error.";
        detailLogs.push({ slug, ok: false, error });
        logger.warn(`Detail fetch failed for ${slug}`, {
          Error: error,
          Action: "continuing with remaining details"
        });
      }
    }
    logger.success(`Details fetched: ${detailLogs.filter((log) => log.ok).length} ok, ${detailLogs.filter((log) => !log.ok).length} failed`);
  } else {
    logger.warn("Detail fetching disabled", { FETCH_DETAILS: "false" });
  }

  logger.phase("🧹 Normalizing startups");
  const normalized = deduped
    .map((item) => {
      const slug = firstString(item.slug, item.handle, item.id);
      const detail = slug ? detailBySlug[slug] ?? null : null;
      const detailError = slug ? detailLogs.find((log) => log.slug === slug && !log.ok)?.error ?? null : null;
      return normalizeStartup(item, asRecord(detail), detailError);
    })
    .filter((startup) => startup !== null);
  logger.step(`Raw records: ${rawItems.length}`);
  logger.step(`Deduped startups: ${deduped.length}`);
  logger.step(`Normalized startups: ${normalized.length}`);
  logger.step(`Skipped invalid records: ${deduped.length - normalized.length}`);

  logger.phase("🧮 Scoring opportunities");
  const scored = scoreStartups(normalized);
  const topN = Math.min(config.topN, scored.length);
  const researchQueue = buildResearchQueue(scored, topN);
  const topFinal = scored[0];
  const topRoi = [...scored].sort((a, b) => b.roiScore - a.roiScore)[0];
  const topLowEffort = [...scored].sort((a, b) => a.buildEffortScore - b.buildEffortScore)[0];
  logger.step(`Scored startups: ${scored.length}`);
  if (topFinal) logger.step(`Top final opportunity: ${topFinal.name ?? topFinal.slug} - score ${topFinal.finalOpportunityScore}`);
  if (topRoi) logger.step(`Top ROI: ${topRoi.name ?? topRoi.slug} - score ${topRoi.roiScore}`);
  if (topLowEffort) logger.step(`Top low-effort: ${topLowEffort.name ?? topLowEffort.slug} - effort ${topLowEffort.buildEffortScore}`);

  const rawOutput: RawOutput = {
    generatedAt: new Date().toISOString(),
    queries: queryLogs,
    details: detailLogs,
    startups: deduped,
    listPages: rawPages,
    detailBySlug
  };

  logger.phase("📦 Exporting output files");
  await writeAndLog(OUTPUT_FILES.rawTrustMrr, () => writeJson(OUTPUT_FILES.rawTrustMrr, rawOutput), logger);
  await writeAndLog(OUTPUT_FILES.normalizedStartups, () => writeJson(OUTPUT_FILES.normalizedStartups, scored), logger);
  await writeAndLog(OUTPUT_FILES.rankedByMrr, () => writeRankedCsv(OUTPUT_FILES.rankedByMrr, [...scored].sort((a, b) => (b.mrrUsd ?? 0) - (a.mrrUsd ?? 0))), logger);
  await writeAndLog(
    OUTPUT_FILES.rankedByRevenueLast30Days,
    () => writeRankedCsv(OUTPUT_FILES.rankedByRevenueLast30Days, [...scored].sort((a, b) => (b.last30DaysUsd ?? 0) - (a.last30DaysUsd ?? 0))),
    logger
  );
  await writeAndLog(OUTPUT_FILES.rankedBySoloFit, () => writeRankedCsv(OUTPUT_FILES.rankedBySoloFit, [...scored].sort((a, b) => b.soloLikelihoodScore - a.soloLikelihoodScore)), logger);
  await writeAndLog(OUTPUT_FILES.rankedByRoi, () => writeRankedCsv(OUTPUT_FILES.rankedByRoi, [...scored].sort((a, b) => b.roiScore - a.roiScore)), logger);
  await writeAndLog(
    OUTPUT_FILES.rankedByLowestBuildEffort,
    () => writeRankedCsv(OUTPUT_FILES.rankedByLowestBuildEffort, [...scored].sort((a, b) => a.buildEffortScore - b.buildEffortScore)),
    logger
  );
  await writeAndLog(OUTPUT_FILES.researchQueue, () => writeResearchQueueCsv(OUTPUT_FILES.researchQueue, researchQueue), logger);
  await writeAndLog(OUTPUT_FILES.topOpportunities, () => writeTopOpportunities(OUTPUT_FILES.topOpportunities, scored, topN), logger);
  await writeAndLog(
    OUTPUT_FILES.researchSummary,
    () => writeResearchSummary(OUTPUT_FILES.researchSummary, scored, queryLogs, detailLogs.filter((log) => log.ok).length, detailLogs.filter((log) => !log.ok).length),
    logger
  );
  await writeAndLog(OUTPUT_FILES.chatGptBrief, () => writeChatGptBrief(OUTPUT_FILES.chatGptBrief, scored), logger);

  const finishedAt = new Date();
  logger.summary("✅ TrustMRR Opportunity Radar complete", [
    "",
    "Runtime:",
    `- Started: ${startedAt.toISOString()}`,
    `- Finished: ${finishedAt.toISOString()}`,
    `- Duration: ${formatDuration(finishedAt.getTime() - startedAt.getTime())}`,
    "",
    "Collection:",
    `- Queries planned: ${queries.length}`,
    `- Queries succeeded: ${queryLogs.filter((query) => !query.error && query.itemsCollected > 0).length}`,
    `- Queries failed/empty: ${queryLogs.filter((query) => query.error || query.itemsCollected === 0).length}`,
    `- Raw records collected: ${rawItems.length}`,
    `- Deduped startups: ${deduped.length}`,
    `- Details fetched: ${detailLogs.filter((log) => log.ok).length}`,
    `- Detail failures: ${detailLogs.filter((log) => !log.ok).length}`,
    "",
    "Outputs:",
    ...OUTPUT_FILE_LIST.map((path) => `- ${path}`),
    "",
    "Failed queries/details:",
    ...compactFailures(queryLogs, detailLogs),
    "",
    "Next:",
    "1. Open reports/research-summary.md",
    "2. Open out/ranked-by-roi.csv",
    "3. Paste reports/chatgpt-brief.md into ChatGPT for competitor research"
  ]);
}

function buildQueries(minMrr: number, maxMrr: number): FetchQuery[] {
  const broad: FetchQuery[] = [
    { name: "achievable-revenue-desc", minMrr, maxMrr, sort: "revenue-desc" },
    { name: "achievable-growth-desc", minMrr, maxMrr, sort: "growth-desc" },
    { name: "achievable-newest", minMrr, maxMrr, sort: "newest" },
    { name: "uncapped-revenue-desc", minMrr, sort: "revenue-desc" },
    { name: "uncapped-growth-desc", minMrr, sort: "growth-desc" },
    { name: "uncapped-newest", minMrr, sort: "newest" }
  ];

  const categoryQueries = CATEGORIES.flatMap((category) => [
    { name: `category-${category}-revenue-desc`, minMrr, sort: "revenue-desc", category },
    { name: `category-${category}-growth-desc`, minMrr, sort: "growth-desc", category }
  ]);

  return [...broad, ...categoryQueries];
}

async function ensureOutputDirs(): Promise<void> {
  await Promise.all(["data", "out", "reports"].map((dir) => mkdir(dir, { recursive: true })));
}

async function writeAndLog(path: string, writer: () => Promise<void>, logger: Logger): Promise<void> {
  await writer();
  logger.fileWritten(path);
}

function queryToSafeParams(query: FetchQuery): Record<string, string | number> {
  return {
    ...(query.category ? { category: query.category } : {}),
    ...(query.minMrr !== undefined ? { minMrr: query.minMrr } : {}),
    ...(query.maxMrr !== undefined ? { maxMrr: query.maxMrr } : {}),
    sort: query.sort
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainder}s`;
}

function compactFailures(queryLogs: { name: string; itemsCollected: number; error: string | null }[], detailLogs: DetailLog[]): string[] {
  const failedQueries = queryLogs.filter((query) => query.error || query.itemsCollected === 0);
  const failedDetails = detailLogs.filter((detail) => !detail.ok);
  const lines: string[] = [];
  if (failedQueries.length === 0 && failedDetails.length === 0) return ["- none"];
  for (const query of failedQueries.slice(0, 8)) lines.push(`- query ${query.name}: ${query.error ?? "no data returned"}`);
  if (failedQueries.length > 8) lines.push(`- ${failedQueries.length - 8} more failed/empty queries`);
  for (const detail of failedDetails.slice(0, 8)) lines.push(`- detail ${detail.slug}: ${detail.error ?? "unknown error"}`);
  if (failedDetails.length > 8) lines.push(`- ${failedDetails.length - 8} more failed details`);
  return lines;
}

main().catch((caught) => {
  const logger = createLogger(parseLogLevel(process.env.LOG_LEVEL));
  const message = caught instanceof Error ? caught.message : "Unknown analyser error.";
  logger.error(message);
  process.exitCode = 1;
});
