export const OUTPUT_FILES = {
  rawTrustMrr: "data/raw-trustmrr.json",
  normalizedStartups: "data/normalized-startups.json",
  rankedByMrr: "out/ranked-by-mrr.csv",
  rankedByRevenueLast30Days: "out/ranked-by-revenue-last-30-days.csv",
  rankedBySoloFit: "out/ranked-by-solo-fit.csv",
  rankedByRoi: "out/ranked-by-roi.csv",
  rankedByLowestBuildEffort: "out/ranked-by-lowest-build-effort.csv",
  researchQueue: "out/research-queue.csv",
  topOpportunities: "reports/top-50-opportunities.md",
  researchSummary: "reports/research-summary.md",
  chatGptBrief: "reports/chatgpt-brief.md"
} as const;

export const OUTPUT_FILE_LIST = Object.values(OUTPUT_FILES);
