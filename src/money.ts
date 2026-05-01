import type { UnknownRecord } from "./types.js";
import { asNumber, asRecord, pickPath, round, textIncludes } from "./utils.js";

export type MoneyScaleMode = "auto" | "cents" | "dollars";
export type MoneyScaleUsed = "cents" | "dollars" | "unknown" | null;
export type MoneyScaleConfidence = "high" | "medium" | "low" | "unknown";

export type MoneyFieldContext = {
  mode: MoneyScaleMode;
  fieldName: string;
  explicitCents?: boolean;
  rawStartup?: UnknownRecord;
};

export type NormalizedMoneyField = {
  rawValue: number | null;
  usdValue: number | null;
  scaleUsed: MoneyScaleUsed;
  confidence: MoneyScaleConfidence;
  warnings: string[];
  possibleHundredXIssue: boolean;
};

export type StartupMoney = {
  rawMrr: number | null;
  rawLast30DaysRevenue: number | null;
  rawTotalRevenue: number | null;
  rawGrowthMRR30d: number | null;
  rawRevenuePerVisitor: number | null;
  rawAskingPrice: number | null;
  mrrUsd: number | null;
  last30DaysUsd: number | null;
  totalRevenueUsd: number | null;
  growthMRR30d: number | null;
  revenuePerVisitor: number | null;
  askingPriceUsd: number | null;
  moneyScaleUsed: MoneyScaleUsed;
  moneyScaleConfidence: MoneyScaleConfidence;
  moneyScaleWarnings: string[];
  possibleHundredXIssue: boolean;
};

type RawMoneyValue = {
  value: number | null;
  explicitCents: boolean;
};

export function normalizeMoneyField(rawValue: unknown, context: MoneyFieldContext): NormalizedMoneyField {
  const value = asNumber(rawValue);
  if (value === null) {
    return {
      rawValue: null,
      usdValue: null,
      scaleUsed: null,
      confidence: "unknown",
      warnings: [],
      possibleHundredXIssue: false
    };
  }

  const detected = context.mode === "auto" ? detectMoneyScale(context.rawStartup ?? {}, context.fieldName, value, context.explicitCents ?? false) : forcedScale(context.mode);
  const usdValue = detected.scaleUsed === "cents" ? round(value / 100, 4) : detected.scaleUsed === "dollars" ? round(value, 4) : null;
  return {
    rawValue: value,
    usdValue,
    scaleUsed: detected.scaleUsed,
    confidence: detected.confidence,
    warnings: detected.warnings,
    possibleHundredXIssue: detected.possibleHundredXIssue
  };
}

export function detectMoneyScale(rawStartup: UnknownRecord, fieldName = "money", rawValue?: number, explicitCents = false): Omit<NormalizedMoneyField, "rawValue" | "usdValue"> {
  const value = rawValue ?? firstPresentMoney(rawStartup).value;
  const text = [
    rawStartup.name,
    rawStartup.description,
    rawStartup.category,
    rawStartup.targetAudience,
    rawStartup.audience,
    rawStartup.customerType
  ]
    .filter(Boolean)
    .join(" ");
  const warnings: string[] = [];

  if (value === null || value === undefined) {
    return { scaleUsed: "unknown", confidence: "unknown", warnings, possibleHundredXIssue: false };
  }

  if (!Number.isInteger(value)) {
    return {
      scaleUsed: "dollars",
      confidence: "high",
      warnings: [`${fieldName} has a non-integer raw value, so it is likely already dollars.`],
      possibleHundredXIssue: false
    };
  }

  const centsValue = value / 100;
  const activeSubscriptions = asNumber(rawStartup.activeSubscriptions) ?? asNumber(rawStartup.activeSubscriptionCount) ?? asNumber(rawStartup.subscriptions);
  const b2bish = textIncludes(text, ["b2b", "saas", "business", "agency", "developer", "shopify", "marketer", "company", "team"]);
  const possibleHundredXIssue = value > 100000 && centsValue < 5000;

  if (possibleHundredXIssue) {
    warnings.push(`${fieldName} raw value is >100000 but cents-normalized value is <5000; possible 100x under-reporting.`);
  }
  if (activeSubscriptions !== null && activeSubscriptions > 0 && centsValue / activeSubscriptions < 5 && b2bish) {
    warnings.push(`${fieldName} cents-normalized revenue per active subscription looks tiny for a B2B-ish product.`);
  }
  if (fieldName === "revenuePerVisitor" && centsValue > 0 && centsValue < 0.001) {
    warnings.push("revenuePerVisitor becomes extremely tiny after cents division.");
  }

  if (possibleHundredXIssue) {
    return { scaleUsed: "dollars", confidence: "medium", warnings, possibleHundredXIssue };
  }

  if (explicitCents) {
    return {
      scaleUsed: "cents",
      confidence: warnings.length > 0 ? "medium" : "high",
      warnings,
      possibleHundredXIssue
    };
  }

  warnings.push(`${fieldName} scale was ambiguous in auto mode; defaulted to cents for docs compatibility.`);
  return {
    scaleUsed: "cents",
    confidence: warnings.length > 1 ? "low" : "medium",
    warnings,
    possibleHundredXIssue
  };
}

export function normalizeStartupMoney(rawStartup: UnknownRecord, mode: MoneyScaleMode): StartupMoney {
  const rawMrr = rawMoney(rawStartup, ["revenue.mrr", "mrr", "mrrCents"]);
  const rawLast30DaysRevenue = rawMoney(rawStartup, ["revenue.last30Days", "revenueLast30Days", "last30DaysRevenue", "last30DaysRevenueCents"]);
  const rawTotalRevenue = rawMoney(rawStartup, ["revenue.total", "totalRevenue", "totalRevenueCents"]);
  const rawGrowthMRR30d = rawMoney(rawStartup, ["growthMRR30d", "mrrGrowth30d", "growthMrr30d"]);
  const rawRevenuePerVisitor = rawMoney(rawStartup, ["revenuePerVisitor", "rpv"]);
  const rawAskingPrice = rawMoney(rawStartup, ["askingPrice", "askingPriceCents"]);
  const fieldValues = [rawMrr, rawLast30DaysRevenue, rawTotalRevenue, rawGrowthMRR30d, rawRevenuePerVisitor, rawAskingPrice];
  const effectiveMode = mode === "auto" && fieldValues.some((field) => field.value !== null && !field.explicitCents && !Number.isInteger(field.value)) ? "dollars" : mode;
  const fields = [
    normalizeMoneyField(rawMrr.value, { mode: effectiveMode, fieldName: "mrr", explicitCents: rawMrr.explicitCents, rawStartup }),
    normalizeMoneyField(rawLast30DaysRevenue.value, { mode: effectiveMode, fieldName: "last30DaysRevenue", explicitCents: rawLast30DaysRevenue.explicitCents, rawStartup }),
    normalizeMoneyField(rawTotalRevenue.value, { mode: effectiveMode, fieldName: "totalRevenue", explicitCents: rawTotalRevenue.explicitCents, rawStartup }),
    normalizeMoneyField(rawGrowthMRR30d.value, { mode: effectiveMode, fieldName: "growthMRR30d", explicitCents: rawGrowthMRR30d.explicitCents, rawStartup }),
    normalizeMoneyField(rawRevenuePerVisitor.value, { mode: effectiveMode, fieldName: "revenuePerVisitor", explicitCents: rawRevenuePerVisitor.explicitCents, rawStartup }),
    normalizeMoneyField(rawAskingPrice.value, { mode: effectiveMode, fieldName: "askingPrice", explicitCents: rawAskingPrice.explicitCents, rawStartup })
  ];

  return {
    rawMrr: rawMrr.value,
    rawLast30DaysRevenue: rawLast30DaysRevenue.value,
    rawTotalRevenue: rawTotalRevenue.value,
    rawGrowthMRR30d: rawGrowthMRR30d.value,
    rawRevenuePerVisitor: rawRevenuePerVisitor.value,
    rawAskingPrice: rawAskingPrice.value,
    mrrUsd: fields[0]?.usdValue ?? null,
    last30DaysUsd: fields[1]?.usdValue ?? null,
    totalRevenueUsd: fields[2]?.usdValue ?? null,
    growthMRR30d: fields[3]?.usdValue ?? null,
    revenuePerVisitor: fields[4]?.usdValue ?? null,
    askingPriceUsd: fields[5]?.usdValue ?? null,
    moneyScaleUsed: aggregateScale(fields),
    moneyScaleConfidence: aggregateConfidence(fields),
    moneyScaleWarnings: [...new Set(fields.flatMap((field) => field.warnings))],
    possibleHundredXIssue: fields.some((field) => field.possibleHundredXIssue)
  };
}

export function parseMoneyScaleMode(value: string | undefined): MoneyScaleMode {
  if (value === "auto" || value === "cents" || value === "dollars") return value;
  return "auto";
}

function forcedScale(mode: "cents" | "dollars"): Omit<NormalizedMoneyField, "rawValue" | "usdValue"> {
  return { scaleUsed: mode, confidence: "high", warnings: [], possibleHundredXIssue: false };
}

function rawMoney(record: UnknownRecord, paths: string[]): RawMoneyValue {
  for (const path of paths) {
    const value = asNumber(pickPath(record, path));
    if (value !== null) return { value, explicitCents: path.toLowerCase().endsWith("cents") };
  }
  return { value: null, explicitCents: false };
}

function firstPresentMoney(record: UnknownRecord): RawMoneyValue {
  const revenue = asRecord(record.revenue);
  return rawMoney({ ...record, revenue }, ["revenue.mrr", "mrr", "mrrCents", "revenue.last30Days", "last30DaysRevenue", "last30DaysRevenueCents"]);
}

function aggregateScale(fields: NormalizedMoneyField[]): MoneyScaleUsed {
  const used = fields.map((field) => field.scaleUsed).filter((scale): scale is Exclude<MoneyScaleUsed, null> => Boolean(scale));
  if (used.length === 0) return null;
  if (used.includes("dollars")) return "dollars";
  if (used.includes("cents")) return "cents";
  return "unknown";
}

function aggregateConfidence(fields: NormalizedMoneyField[]): MoneyScaleConfidence {
  const confidences = fields.map((field) => field.confidence).filter((confidence) => confidence !== "unknown");
  if (confidences.length === 0) return "unknown";
  if (confidences.includes("low")) return "low";
  if (confidences.includes("medium")) return "medium";
  return "high";
}
