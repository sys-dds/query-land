export const OUTPUT_FILE_NAMES = {
  data: {
    rawTrustMrr: "raw-trustmrr.json",
    normalizedStartups: "normalized-startups.json"
  },
  out: {
    rankedByMrr: "ranked-by-mrr.csv",
    rankedByRevenueLast30Days: "ranked-by-revenue-last-30-days.csv",
    rankedBySoloFit: "ranked-by-solo-fit.csv",
    rankedByRoi: "ranked-by-roi.csv",
    rankedByLowestBuildEffort: "ranked-by-lowest-build-effort.csv",
    researchQueue: "research-queue.csv",
    moneyScaleAudit: "money-scale-audit.csv",
    cleanOpportunityTable: "clean-opportunity-table.csv"
  },
  reports: {
    topOpportunities: "top-50-opportunities.md",
    researchSummary: "research-summary.md",
    chatGptBrief: "chatgpt-brief.md",
    cleanOpportunityTable: "clean-opportunity-table.md"
  },
  root: {
    runSummary: "run-summary.json",
    manifest: "manifest.md"
  }
} as const;

export const OUTPUT_FILE_RELATIVE_PATHS = [
  `data/${OUTPUT_FILE_NAMES.data.rawTrustMrr}`,
  `data/${OUTPUT_FILE_NAMES.data.normalizedStartups}`,
  `out/${OUTPUT_FILE_NAMES.out.rankedByMrr}`,
  `out/${OUTPUT_FILE_NAMES.out.rankedByRevenueLast30Days}`,
  `out/${OUTPUT_FILE_NAMES.out.rankedBySoloFit}`,
  `out/${OUTPUT_FILE_NAMES.out.rankedByRoi}`,
  `out/${OUTPUT_FILE_NAMES.out.rankedByLowestBuildEffort}`,
  `out/${OUTPUT_FILE_NAMES.out.researchQueue}`,
  `out/${OUTPUT_FILE_NAMES.out.moneyScaleAudit}`,
  `out/${OUTPUT_FILE_NAMES.out.cleanOpportunityTable}`,
  `reports/${OUTPUT_FILE_NAMES.reports.topOpportunities}`,
  `reports/${OUTPUT_FILE_NAMES.reports.researchSummary}`,
  `reports/${OUTPUT_FILE_NAMES.reports.chatGptBrief}`,
  `reports/${OUTPUT_FILE_NAMES.reports.cleanOpportunityTable}`,
  OUTPUT_FILE_NAMES.root.runSummary,
  OUTPUT_FILE_NAMES.root.manifest
];
