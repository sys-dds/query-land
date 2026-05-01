import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { writeChatGptBrief, writeRankedCsv, writeResearchQueueCsv, writeResearchSummary, writeTopOpportunities } from "./exporters.js";
import { dedupeBySlug, normalizeStartup } from "./normalize.js";
import { buildResearchQueue } from "./researchQueue.js";
import { scoreStartups } from "./scoring.js";
import { TrustMrrClient } from "./trustmrrClient.js";
import type { DetailLog, FetchQuery, RawOutput, UnknownRecord } from "./types.js";
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
  await ensureOutputDirs();

  const client = new TrustMrrClient(config);
  const queries = buildQueries(config.minMrrCents, config.maxMrrCents);
  const rawItems: UnknownRecord[] = [];
  const rawPages: UnknownRecord[] = [];
  const queryLogs = [];

  for (const query of queries) {
    console.log(`Fetching ${query.name}`);
    const result = await client.fetchQuery(query);
    rawItems.push(...result.items);
    rawPages.push(...result.rawPages);
    queryLogs.push(result.log);
    if (result.log.error) console.warn(`Query failed: ${query.name}: ${result.log.error}`);
  }

  const deduped = dedupeBySlug(rawItems);
  const detailBySlug: Record<string, UnknownRecord> = {};
  const detailLogs: DetailLog[] = [];

  if (config.fetchDetails) {
    for (const item of deduped) {
      const slug = firstString(item.slug, item.handle, item.id);
      if (!slug) continue;
      try {
        console.log(`Fetching detail for ${slug}`);
        const detail = await client.fetchDetail(slug);
        detailBySlug[slug] = detail;
        detailLogs.push({ slug, ok: true, error: null });
      } catch (caught) {
        const error = caught instanceof Error ? caught.message : "Unknown TrustMRR detail fetch error.";
        detailLogs.push({ slug, ok: false, error });
        console.warn(`Detail fetch failed for ${slug}: ${error}`);
      }
    }
  }

  const normalized = deduped
    .map((item) => {
      const slug = firstString(item.slug, item.handle, item.id);
      const detail = slug ? detailBySlug[slug] ?? null : null;
      const detailError = slug ? detailLogs.find((log) => log.slug === slug && !log.ok)?.error ?? null : null;
      return normalizeStartup(item, asRecord(detail), detailError);
    })
    .filter((startup) => startup !== null);

  const scored = scoreStartups(normalized);
  const topN = Math.min(config.topN, scored.length);
  const researchQueue = buildResearchQueue(scored, topN);

  const rawOutput: RawOutput = {
    generatedAt: new Date().toISOString(),
    queries: queryLogs,
    details: detailLogs,
    startups: deduped,
    listPages: rawPages,
    detailBySlug
  };

  await writeJson("data/raw-trustmrr.json", rawOutput);
  await writeJson("data/normalized-startups.json", scored);
  await writeRankedCsv("out/ranked-by-mrr.csv", [...scored].sort((a, b) => (b.mrrUsd ?? 0) - (a.mrrUsd ?? 0)));
  await writeRankedCsv("out/ranked-by-revenue-last-30-days.csv", [...scored].sort((a, b) => (b.last30DaysUsd ?? 0) - (a.last30DaysUsd ?? 0)));
  await writeRankedCsv("out/ranked-by-solo-fit.csv", [...scored].sort((a, b) => b.soloLikelihoodScore - a.soloLikelihoodScore));
  await writeRankedCsv("out/ranked-by-roi.csv", [...scored].sort((a, b) => b.roiScore - a.roiScore));
  await writeRankedCsv("out/ranked-by-lowest-build-effort.csv", [...scored].sort((a, b) => a.buildEffortScore - b.buildEffortScore));
  await writeResearchQueueCsv("out/research-queue.csv", researchQueue);
  await writeTopOpportunities("reports/top-50-opportunities.md", scored, topN);
  await writeResearchSummary("reports/research-summary.md", scored, queryLogs, detailLogs.filter((log) => log.ok).length, detailLogs.filter((log) => !log.ok).length);
  await writeChatGptBrief("reports/chatgpt-brief.md", scored);

  console.log(`Done. Collected ${rawItems.length} records, deduped to ${deduped.length}, wrote ${scored.length} normalized startups.`);
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

main().catch((caught) => {
  const message = caught instanceof Error ? caught.message : "Unknown analyser error.";
  console.error(message);
  process.exitCode = 1;
});
