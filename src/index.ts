import { loadConfig, safeConfigSummary } from "./config.js";
import {
  writeChatGptBrief,
  writeCleanOpportunityTableCsv,
  writeCleanOpportunityTableMd,
  writeMoneyScaleAuditCsv,
  writeRankedCsv,
  writeResearchQueueCsv,
  writeResearchSummary,
  writeTopOpportunities
} from "./exporters.js";
import { createLogger, parseLogLevel, type Logger } from "./logger.js";
import { dedupeBySlug, normalizeStartup } from "./normalize.js";
import { buildResearchQueue } from "./researchQueue.js";
import {
  allPlannedRunOutputFiles,
  copyRunMetadataToLatest,
  copyRunToLegacyOutputs,
  copySuccessfulRunToLatest,
  createRunContext,
  createRunFolders,
  nextFilesToOpen,
  type RunContext,
  type RunStats,
  writeManifest,
  writeRunSummary
} from "./runContext.js";
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
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const configSummary = safeConfigSummary(config);
  const runContext = await createRunContext();
  const writtenFiles: string[] = [];
  let latestUpdated = false;

  logger.banner("TrustMRR Opportunity Radar");
  logger.info(`Run ID: ${runContext.runId}`);
  logger.info(`Run folder: ${runContext.runRoot}`);
  logger.info(`Latest folder: ${runContext.latestRoot}/`);
  logger.info("Config:");
  for (const [key, value] of Object.entries(configSummary)) {
    logger.step(`- ${key}: ${value}`);
  }

  await createRunFolders(runContext);

  try {
    if (!config.apiKey) {
      throw new Error("TRUSTMRR_API_KEY is required. Create a local .env from .env.example and rerun the analyser.");
    }

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
        return normalizeStartup(item, asRecord(detail), detailError, config.moneyScaleMode);
      })
      .filter((startup) => startup !== null);
    logger.step(`Raw records: ${rawItems.length}`);
    logger.step(`Deduped startups: ${deduped.length}`);
    logger.step(`Normalized startups: ${normalized.length}`);
    logger.step(`Skipped invalid records: ${deduped.length - normalized.length}`);
    logger.step("Money scaling:");
    logger.step(`- mode: ${config.moneyScaleMode}`);
    logger.step(`- cents: ${normalized.filter((startup) => startup.moneyScaleUsed === "cents").length}`);
    logger.step(`- dollars: ${normalized.filter((startup) => startup.moneyScaleUsed === "dollars").length}`);
    logger.step(`- unknown: ${normalized.filter((startup) => startup.moneyScaleUsed === "unknown" || startup.moneyScaleUsed === null).length}`);
    logger.step(`- possible 100x anomalies: ${normalized.filter((startup) => startup.possibleHundredXIssue).length}`);

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
    await writeAndLog(runContext.outputFiles.data.rawTrustMrr, () => writeJson(runContext.outputFiles.data.rawTrustMrr, rawOutput), logger, writtenFiles);
    await writeAndLog(runContext.outputFiles.data.normalizedStartups, () => writeJson(runContext.outputFiles.data.normalizedStartups, scored), logger, writtenFiles);
    await writeAndLog(
      runContext.outputFiles.out.rankedByMrr,
      () => writeRankedCsv(runContext.outputFiles.out.rankedByMrr, [...scored].sort((a, b) => (b.mrrUsd ?? 0) - (a.mrrUsd ?? 0))),
      logger,
      writtenFiles
    );
    await writeAndLog(
      runContext.outputFiles.out.rankedByRevenueLast30Days,
      () => writeRankedCsv(runContext.outputFiles.out.rankedByRevenueLast30Days, [...scored].sort((a, b) => (b.last30DaysUsd ?? 0) - (a.last30DaysUsd ?? 0))),
      logger,
      writtenFiles
    );
    await writeAndLog(
      runContext.outputFiles.out.rankedBySoloFit,
      () => writeRankedCsv(runContext.outputFiles.out.rankedBySoloFit, [...scored].sort((a, b) => b.soloLikelihoodScore - a.soloLikelihoodScore)),
      logger,
      writtenFiles
    );
    await writeAndLog(
      runContext.outputFiles.out.rankedByRoi,
      () => writeRankedCsv(runContext.outputFiles.out.rankedByRoi, [...scored].sort((a, b) => b.roiScore - a.roiScore)),
      logger,
      writtenFiles
    );
    await writeAndLog(
      runContext.outputFiles.out.rankedByLowestBuildEffort,
      () => writeRankedCsv(runContext.outputFiles.out.rankedByLowestBuildEffort, [...scored].sort((a, b) => a.buildEffortScore - b.buildEffortScore)),
      logger,
      writtenFiles
    );
    await writeAndLog(runContext.outputFiles.out.researchQueue, () => writeResearchQueueCsv(runContext.outputFiles.out.researchQueue, researchQueue), logger, writtenFiles);
    await writeAndLog(runContext.outputFiles.out.moneyScaleAudit, () => writeMoneyScaleAuditCsv(runContext.outputFiles.out.moneyScaleAudit, scored), logger, writtenFiles);
    await writeAndLog(runContext.outputFiles.out.cleanOpportunityTable, () => writeCleanOpportunityTableCsv(runContext.outputFiles.out.cleanOpportunityTable, scored), logger, writtenFiles);
    await writeAndLog(runContext.outputFiles.reports.topOpportunities, () => writeTopOpportunities(runContext.outputFiles.reports.topOpportunities, scored, topN), logger, writtenFiles);
    await writeAndLog(
      runContext.outputFiles.reports.researchSummary,
      () => writeResearchSummary(runContext.outputFiles.reports.researchSummary, scored, queryLogs, detailLogs.filter((log) => log.ok).length, detailLogs.filter((log) => !log.ok).length, config.moneyScaleMode),
      logger,
      writtenFiles
    );
    await writeAndLog(
      runContext.outputFiles.reports.chatGptBrief,
      () =>
        writeChatGptBrief(runContext.outputFiles.reports.chatGptBrief, scored, {
          generatedAt: new Date(),
          topN,
          moneyScaleMode: config.moneyScaleMode,
          queryLogs,
          detailsFetched: detailLogs.filter((log) => log.ok).length,
          failedDetails: detailLogs.filter((log) => !log.ok).length,
          runId: runContext.runId,
          runFolder: runContext.runRoot,
          latestFolder: runContext.latestRoot
        }),
      logger,
      writtenFiles
    );
    await writeAndLog(runContext.outputFiles.reports.cleanOpportunityTable, () => writeCleanOpportunityTableMd(runContext.outputFiles.reports.cleanOpportunityTable, scored), logger, writtenFiles);
    if (scored.some((startup) => startup.possibleHundredXIssue)) {
      logger.warn("Possible money scaling anomalies detected", { Open: "latest/out/money-scale-audit.csv" });
    }

    const stats = statsFor(queries.length, queryLogs, rawItems.length, deduped.length, normalized.length, scored.length, detailLogs);
    const failedQueries = queryLogs.filter((query) => query.error || query.itemsCollected === 0);
    const failedDetails = detailLogs.filter((detail) => !detail.ok);
    const finishedAt = new Date();

    await writeRunSummary(runContext, {
      status: "success",
      finishedAt,
      configSummary,
      outputFiles: [...writtenFiles, runContext.outputFiles.root.runSummary, runContext.outputFiles.root.manifest],
      stats,
      failedQueries,
      failedDetails,
      latestUpdated
    });
    writtenFiles.push(runContext.outputFiles.root.runSummary);
    logger.fileWritten(runContext.outputFiles.root.runSummary);
    await writeManifest(runContext, {
      status: "success",
      finishedAt,
      configSummary,
      outputFiles: [...writtenFiles, runContext.outputFiles.root.manifest],
      stats,
      failedQueries,
      failedDetails,
      latestUpdated
    });
    writtenFiles.push(runContext.outputFiles.root.manifest);
    logger.fileWritten(runContext.outputFiles.root.manifest);

    try {
      await copySuccessfulRunToLatest(runContext);
      latestUpdated = true;
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "Unknown latest copy error.";
      logger.warn("Run completed, but latest copy failed", {
        Error: error,
        RunFolder: runContext.runRoot
      });
    }

    if (latestUpdated) {
      const finalFinishedAt = new Date();
      await writeRunSummary(runContext, {
        status: "success",
        finishedAt: finalFinishedAt,
        configSummary,
        outputFiles: writtenFiles,
        stats,
        failedQueries,
        failedDetails,
        latestUpdated
      });
      await writeManifest(runContext, {
        status: "success",
        finishedAt: finalFinishedAt,
        configSummary,
        outputFiles: writtenFiles,
        stats,
        failedQueries,
        failedDetails,
        latestUpdated
      });
      try {
        await copyRunMetadataToLatest(runContext);
      } catch (caught) {
        const error = caught instanceof Error ? caught.message : "Unknown latest metadata copy error.";
        logger.warn("Latest was created, but latest metadata refresh failed", { Error: error });
      }
    }

    if (config.legacyOutputsEnabled) {
      logger.warn("LEGACY_OUTPUTS_ENABLED=true; root data/out/reports will be overwritten.");
      await copyRunToLegacyOutputs(runContext);
    }

    logger.summary("✅ Run complete", [
      "",
      "Runtime:",
      `- Started: ${runContext.runStartedAt.toISOString()}`,
      `- Finished: ${new Date().toISOString()}`,
      `- Duration: ${formatDuration(Date.now() - runContext.runStartedAt.getTime())}`,
      "",
      "Collection:",
      `- Queries planned: ${stats.queriesPlanned}`,
      `- Queries succeeded: ${stats.queriesSucceeded}`,
      `- Queries failed/empty: ${stats.queriesFailedOrEmpty}`,
      `- Raw records collected: ${stats.rawRecordsCollected}`,
      `- Deduped startups: ${stats.dedupedStartups}`,
      `- Normalized startups: ${stats.normalizedStartups}`,
      `- Scored startups: ${stats.scoredStartups}`,
      `- Details fetched: ${stats.detailsFetched}`,
      `- Detail failures: ${stats.detailFailures}`,
      "",
      "Run folder:",
      `- ${runContext.runRoot}`,
      "",
      "Latest updated:",
      `- ${latestUpdated}`,
      "",
      "Outputs:",
      ...allPlannedRunOutputFiles(runContext).map((path) => `- ${path}`),
      "",
      "Failed queries/details:",
      ...compactFailures(failedQueries, failedDetails),
      "",
      latestUpdated ? "Open these:" : "Latest was not updated; open these run files instead:",
      ...(latestUpdated ? nextFilesToOpen() : runSpecificNextFiles(runContext)).map((path, index) => `${index + 1}. ${path}`)
    ]);
  } catch (caught) {
    const finishedAt = new Date();
    const error = caught instanceof Error ? { message: caught.message, name: caught.name } : { message: "Unknown analyser error.", name: null };
    await writeFailureArtifacts(runContext, logger, configSummary, writtenFiles, finishedAt, error);
    logger.error("Run failed", {
      Error: error.message,
      PartialOutputsKeptAt: runContext.runRoot,
      Latest: "not updated"
    });
    process.exitCode = 1;
  }
}

function buildQueries(minMrr: number, maxMrr: number): FetchQuery[] {
  const broad: FetchQuery[] = [
    { name: "configured-range-revenue-desc", minMrr, maxMrr, sort: "revenue-desc" },
    { name: "configured-range-growth-desc", minMrr, maxMrr, sort: "growth-desc" },
    { name: "configured-range-newest", minMrr, maxMrr, sort: "newest" },
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

async function writeAndLog(path: string, writer: () => Promise<void>, logger: Logger, writtenFiles: string[]): Promise<void> {
  await writer();
  writtenFiles.push(path);
  logger.fileWritten(path);
}

async function writeFailureArtifacts(
  runContext: RunContext,
  logger: Logger,
  configSummary: ReturnType<typeof safeConfigSummary>,
  writtenFiles: string[],
  finishedAt: Date,
  error: { message: string; name: string | null }
): Promise<void> {
  try {
    await writeRunSummary(runContext, {
      status: "failed",
      finishedAt,
      configSummary,
      outputFiles: [...writtenFiles, runContext.outputFiles.root.runSummary, runContext.outputFiles.root.manifest],
      latestUpdated: false,
      error
    });
    writtenFiles.push(runContext.outputFiles.root.runSummary);
    logger.fileWritten(runContext.outputFiles.root.runSummary);
    await writeManifest(runContext, {
      status: "failed",
      finishedAt,
      configSummary,
      outputFiles: [...writtenFiles, runContext.outputFiles.root.manifest],
      latestUpdated: false,
      error
    });
    logger.fileWritten(runContext.outputFiles.root.manifest);
  } catch (caught) {
    const artifactError = caught instanceof Error ? caught.message : "Unknown failure artifact error.";
    logger.warn("Could not write failure run-summary/manifest", { Error: artifactError });
  }
}

function runSpecificNextFiles(runContext: RunContext): string[] {
  return [runContext.outputFiles.reports.researchSummary, runContext.outputFiles.reports.cleanOpportunityTable, runContext.outputFiles.out.rankedByRoi, runContext.outputFiles.reports.chatGptBrief];
}

function statsFor(
  queriesPlanned: number,
  queryLogs: QueryLog[],
  rawRecordsCollected: number,
  dedupedStartups: number,
  normalizedStartups: number,
  scoredStartups: number,
  detailLogs: DetailLog[]
): RunStats {
  return {
    queriesPlanned,
    queriesSucceeded: queryLogs.filter((query) => !query.error && query.itemsCollected > 0).length,
    queriesFailedOrEmpty: queryLogs.filter((query) => query.error || query.itemsCollected === 0).length,
    rawRecordsCollected,
    dedupedStartups,
    normalizedStartups,
    scoredStartups,
    detailsFetched: detailLogs.filter((log) => log.ok).length,
    detailFailures: detailLogs.filter((log) => !log.ok).length
  };
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
