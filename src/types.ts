export type UnknownRecord = Record<string, unknown>;

export type FetchQuery = {
  name: string;
  minMrr?: number;
  maxMrr?: number;
  sort: string;
  category?: string;
};

export type QueryLog = {
  name: string;
  params: UnknownRecord;
  pagesFetched: number;
  itemsCollected: number;
  error: string | null;
};

export type DetailLog = {
  slug: string;
  ok: boolean;
  error: string | null;
};

export type RawOutput = {
  generatedAt: string;
  queries: QueryLog[];
  details: DetailLog[];
  startups: UnknownRecord[];
  listPages: UnknownRecord[];
  detailBySlug: Record<string, UnknownRecord>;
};

export type NormalizedStartup = {
  name: string | null;
  slug: string;
  website: string | null;
  description: string | null;
  category: string | null;
  targetAudience: string | null;
  country: string | null;
  foundedDate: string | null;
  paymentProvider: string | null;
  last30DaysUsd: number | null;
  mrrUsd: number | null;
  totalRevenueUsd: number | null;
  customers: number | null;
  activeSubscriptions: number | null;
  profitMarginLast30Days: number | null;
  growth30d: number | null;
  growthMRR30d: number | null;
  visitorsLast30Days: number | null;
  revenuePerVisitor: number | null;
  googleSearchImpressionsLast30Days: number | null;
  rank: number | null;
  onSale: boolean | null;
  askingPriceUsd: number | null;
  multiple: number | null;
  xHandle: string | null;
  xFollowerCount: number | null;
  isMerchantOfRecord: boolean | null;
  techStack: string[];
  founderCount: number | null;
  hasKnownFounderData: boolean;
  cofounders: unknown;
  raw: UnknownRecord;
  detailError: string | null;
};

export type ScoredStartup = NormalizedStartup & {
  avgMrrPerActiveSubUsd: number | null;
  avgRevenuePerCustomerUsd: number | null;
  isB2B: boolean;
  isHighTicket: boolean;
  isLowCustomerHighRevenue: boolean;
  isLowTrafficHighRevenue: boolean;
  likelySoloOrTinyTeam: boolean;
  categoryBucket: CategoryBucket;
  rejectionFlags: string[];
  opportunityNotes: string[];
  revenueScore: number;
  soloLikelihoodScore: number;
  roiScore: number;
  buildEffortScore: number;
  buildEaseScore: number;
  distributionDifficultyScore: number;
  manualValidationScore: number;
  finalOpportunityScore: number;
};

export type CategoryBucket =
  | "high-ticket-low-customer"
  | "low-ticket-high-volume"
  | "api-first"
  | "analytics-reporting"
  | "marketing-automation"
  | "developer-tool"
  | "ai-wrapper"
  | "content-tool"
  | "utility-tool"
  | "marketplace"
  | "consumer-app"
  | "too-complex"
  | "unknown";

export type ResearchQueueRow = {
  priorityRank: number;
  name: string;
  website: string | null;
  category: string | null;
  mrrUsd: number | null;
  last30DaysUsd: number | null;
  finalOpportunityScore: number;
  whyResearchThis: string;
  googleSearchQuery: string;
  competitorSearchQuery: string;
  pricingSearchQuery: string;
  founderSearchQuery: string;
  linkedinSearchQuery: string;
  productHuntSearchQuery: string;
  redditSearchQuery: string;
  alternativeToSearchQuery: string;
};
