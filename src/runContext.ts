import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SafeConfigSummary } from "./config.js";
import { OUTPUT_FILE_NAMES, OUTPUT_FILE_RELATIVE_PATHS } from "./outputFiles.js";
import type { DetailLog, QueryLog } from "./types.js";
import { writeJson, writeText } from "./utils.js";

export type RunStatus = "success" | "failed";

export type RunContext = {
  runId: string;
  runStartedAt: Date;
  runRoot: string;
  dataDir: string;
  outDir: string;
  reportsDir: string;
  latestRoot: string;
  outputFiles: {
    data: {
      rawTrustMrr: string;
      normalizedStartups: string;
    };
    out: {
      rankedByMrr: string;
      rankedByRevenueLast30Days: string;
      rankedBySoloFit: string;
      rankedByRoi: string;
      rankedByLowestBuildEffort: string;
      researchQueue: string;
      moneyScaleAudit: string;
      cleanOpportunityTable: string;
    };
    reports: {
      topOpportunities: string;
      researchSummary: string;
      chatGptBrief: string;
      cleanOpportunityTable: string;
    };
    root: {
      runSummary: string;
      manifest: string;
    };
  };
};

export type RunStats = {
  queriesPlanned: number;
  queriesSucceeded: number;
  queriesFailedOrEmpty: number;
  rawRecordsCollected: number;
  dedupedStartups: number;
  normalizedStartups: number;
  scoredStartups: number;
  detailsFetched: number;
  detailFailures: number;
};

export type RunSummaryInput = {
  status: RunStatus;
  finishedAt: Date;
  configSummary?: SafeConfigSummary;
  outputFiles: string[];
  stats?: RunStats;
  failedQueries?: QueryLog[];
  failedDetails?: DetailLog[];
  latestUpdated: boolean;
  error?: {
    message: string;
    name: string | null;
  };
};

export async function createRunContext(now = new Date()): Promise<RunContext> {
  const runStartedAt = now;
  const baseRunId = formatRunId(now);
  const runId = await uniqueRunId(baseRunId);
  const runRoot = join("runs", runId);
  const dataDir = join(runRoot, "data");
  const outDir = join(runRoot, "out");
  const reportsDir = join(runRoot, "reports");
  const latestRoot = "latest";

  return {
    runId,
    runStartedAt,
    runRoot,
    dataDir,
    outDir,
    reportsDir,
    latestRoot,
    outputFiles: {
      data: {
        rawTrustMrr: join(dataDir, OUTPUT_FILE_NAMES.data.rawTrustMrr),
        normalizedStartups: join(dataDir, OUTPUT_FILE_NAMES.data.normalizedStartups)
      },
      out: {
        rankedByMrr: join(outDir, OUTPUT_FILE_NAMES.out.rankedByMrr),
        rankedByRevenueLast30Days: join(outDir, OUTPUT_FILE_NAMES.out.rankedByRevenueLast30Days),
        rankedBySoloFit: join(outDir, OUTPUT_FILE_NAMES.out.rankedBySoloFit),
        rankedByRoi: join(outDir, OUTPUT_FILE_NAMES.out.rankedByRoi),
        rankedByLowestBuildEffort: join(outDir, OUTPUT_FILE_NAMES.out.rankedByLowestBuildEffort),
        researchQueue: join(outDir, OUTPUT_FILE_NAMES.out.researchQueue),
        moneyScaleAudit: join(outDir, OUTPUT_FILE_NAMES.out.moneyScaleAudit),
        cleanOpportunityTable: join(outDir, OUTPUT_FILE_NAMES.out.cleanOpportunityTable)
      },
      reports: {
        topOpportunities: join(reportsDir, OUTPUT_FILE_NAMES.reports.topOpportunities),
        researchSummary: join(reportsDir, OUTPUT_FILE_NAMES.reports.researchSummary),
        chatGptBrief: join(reportsDir, OUTPUT_FILE_NAMES.reports.chatGptBrief),
        cleanOpportunityTable: join(reportsDir, OUTPUT_FILE_NAMES.reports.cleanOpportunityTable)
      },
      root: {
        runSummary: join(runRoot, OUTPUT_FILE_NAMES.root.runSummary),
        manifest: join(runRoot, OUTPUT_FILE_NAMES.root.manifest)
      }
    }
  };
}

export async function createRunFolders(context: RunContext): Promise<void> {
  await Promise.all([context.dataDir, context.outDir, context.reportsDir].map((dir) => mkdir(dir, { recursive: true })));
}

export async function copySuccessfulRunToLatest(context: RunContext): Promise<void> {
  await copyDirectoryContentsReplacing(context.runRoot, context.latestRoot);
}

export async function copyRunMetadataToLatest(context: RunContext): Promise<void> {
  await Promise.all([
    cp(context.outputFiles.root.runSummary, join(context.latestRoot, OUTPUT_FILE_NAMES.root.runSummary)),
    cp(context.outputFiles.root.manifest, join(context.latestRoot, OUTPUT_FILE_NAMES.root.manifest))
  ]);
}

export async function copyRunToLegacyOutputs(context: RunContext): Promise<void> {
  await Promise.all([
    copyDirectoryReplacing(context.dataDir, "data"),
    copyDirectoryReplacing(context.outDir, "out"),
    copyDirectoryReplacing(context.reportsDir, "reports")
  ]);
}

export async function writeRunSummary(context: RunContext, input: RunSummaryInput): Promise<void> {
  const summary = {
    runId: context.runId,
    status: input.status,
    startedAt: context.runStartedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    durationMs: input.finishedAt.getTime() - context.runStartedAt.getTime(),
    configSummary: input.configSummary,
    outputFiles: input.outputFiles,
    ...(input.stats ? { stats: input.stats } : {}),
    ...(input.failedQueries ? { failedQueries: input.failedQueries.map(compactQueryFailure) } : {}),
    ...(input.failedDetails ? { failedDetails: input.failedDetails.map(compactDetailFailure) } : {}),
    latestUpdated: input.latestUpdated,
    nextFilesToOpen: nextFilesToOpen(),
    ...(input.error
      ? {
          error: input.error,
          partialRunFolder: context.runRoot
        }
      : {})
  };
  await writeJson(context.outputFiles.root.runSummary, summary);
}

export async function writeManifest(context: RunContext, input: RunSummaryInput): Promise<void> {
  const lines = [
    "# TrustMRR Opportunity Radar Run",
    "",
    "## Run",
    "",
    `- Run ID: ${context.runId}`,
    `- Status: ${input.status}`,
    `- Started: ${context.runStartedAt.toISOString()}`,
    `- Finished: ${input.finishedAt.toISOString()}`,
    `- Duration: ${formatDuration(input.finishedAt.getTime() - context.runStartedAt.getTime())}`,
    `- Run folder: ${context.runRoot}`,
    `- Latest updated: ${input.latestUpdated}`,
    "",
    "## Config summary",
    "",
    ...configLines(input.configSummary),
    "",
    "## Collection summary",
    "",
    ...statsLines(input.stats),
    "",
    "## Output files",
    "",
    ...input.outputFiles.map((path) => `- ${toRunRelativePath(context, path)}`),
    "",
    "## Failed queries",
    "",
    ...failureLines(input.failedQueries, "name"),
    "",
    "## Failed detail fetches",
    "",
    ...failureLines(input.failedDetails, "slug"),
    "",
    "## Next files to open",
    "",
    "1. reports/research-summary.md",
    "2. out/ranked-by-roi.csv",
    "3. reports/chatgpt-brief.md",
    "",
    "## Important limitations",
    "",
    "- TrustMRR does not confirm staff count.",
    "- Cofounders are only a proxy.",
    "- Missing founder data is not proof of solo-founder status.",
    "- Competitor research still needs external verification.",
    "- Revenue data depends on TrustMRR accuracy.",
    "- Build effort is heuristic, not fact.",
    ""
  ];

  await writeText(context.outputFiles.root.manifest, `${lines.join("\n")}\n`);
}

export function allPlannedRunOutputFiles(context: RunContext): string[] {
  return OUTPUT_FILE_RELATIVE_PATHS.map((relativePath) => join(context.runRoot, relativePath));
}

export function toRunRelativePath(context: RunContext, path: string): string {
  return path.startsWith(`${context.runRoot}/`) ? path.slice(context.runRoot.length + 1) : path;
}

export function nextFilesToOpen(): string[] {
  return ["latest/reports/research-summary.md", "latest/reports/clean-opportunity-table.md", "latest/out/ranked-by-roi.csv", "latest/reports/chatgpt-brief.md"];
}

function formatRunId(date: Date): string {
  const parts = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]}_${parts[3]}-${parts[4]}-${parts[5]}`;
}

async function uniqueRunId(baseRunId: string): Promise<string> {
  await mkdir("runs", { recursive: true });
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const runId = suffix === 0 ? baseRunId : `${baseRunId}-${String(suffix).padStart(3, "0")}`;
    try {
      await mkdir(join("runs", runId), { recursive: false });
      return runId;
    } catch (caught) {
      const error = caught as NodeJS.ErrnoException;
      if (error.code !== "EEXIST") throw caught;
    }
  }
  throw new Error(`Unable to create a unique run folder for ${baseRunId}.`);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

async function copyDirectoryReplacing(from: string, to: string): Promise<void> {
  await copyDirectoryContentsReplacing(from, to);
}

async function copyDirectoryContentsReplacing(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(to)) {
    await rm(join(to, entry), { recursive: true, force: true });
  }
  for (const entry of await readdir(from)) {
    await cp(join(from, entry), join(to, entry), { recursive: true });
  }
}

function compactQueryFailure(query: QueryLog): Record<string, unknown> {
  return {
    name: query.name,
    itemsCollected: query.itemsCollected,
    pagesFetched: query.pagesFetched,
    error: query.error
  };
}

function compactDetailFailure(detail: DetailLog): Record<string, unknown> {
  return {
    slug: detail.slug,
    error: detail.error
  };
}

function configLines(configSummary: SafeConfigSummary | undefined): string[] {
  if (!configSummary) return ["- unavailable"];
  return Object.entries(configSummary).map(([key, value]) => `- ${key}: ${value}`);
}

function statsLines(stats: RunStats | undefined): string[] {
  if (!stats) return ["- unavailable"];
  return Object.entries(stats).map(([key, value]) => `- ${key}: ${value}`);
}

function failureLines<T extends QueryLog | DetailLog>(items: T[] | undefined, labelKey: "name" | "slug"): string[] {
  if (!items || items.length === 0) return ["- none"];
  return items.slice(0, 20).map((item) => {
    const label = labelKey === "name" ? (item as QueryLog).name : (item as DetailLog).slug;
    const error = "itemsCollected" in item && item.itemsCollected === 0 && !item.error ? "no data returned" : item.error ?? "unknown error";
    return `- ${label}: ${error}`;
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${remainder}s`;
}
