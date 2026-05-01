import type { NormalizedStartup, UnknownRecord } from "./types.js";
import { asArray, asBoolean, asNumber, asRecord, asString, centsToUsd, firstNumber, firstString, pickPath } from "./utils.js";

export function normalizeStartup(base: UnknownRecord, detail: UnknownRecord | null, detailError: string | null): NormalizedStartup | null {
  const merged = { ...base, ...(detail ?? {}) };
  const slug = firstString(merged.slug, merged.handle, merged.id);
  if (!slug) return null;

  const revenue = asRecord(merged.revenue);
  const detailDescription = firstString(merged.fullDescription, merged.longDescription, merged.description);
  const cofounders = merged.cofounders ?? merged.founders ?? merged.team;
  const founderCount = normalizeFounderCount(cofounders);
  const techStack = normalizeStringList(merged.techStack ?? merged.stack ?? merged.technologies);

  return {
    name: firstString(merged.name, merged.title),
    slug,
    website: firstString(merged.website, merged.url, merged.homepage),
    description: detailDescription,
    category: firstString(merged.category, merged.categoryName, pickPath(merged, "category.name")),
    targetAudience: firstString(merged.targetAudience, merged.audience, merged.customerType),
    country: firstString(merged.country, pickPath(merged, "location.country")),
    foundedDate: firstString(merged.foundedDate, merged.foundedAt, merged.launchDate),
    paymentProvider: firstString(merged.paymentProvider, merged.processor),
    last30DaysUsd: centsToUsd(revenue?.last30Days ?? merged.revenueLast30Days ?? merged.last30DaysRevenue ?? merged.last30DaysRevenueCents),
    mrrUsd: centsToUsd(revenue?.mrr ?? merged.mrr ?? merged.mrrCents),
    totalRevenueUsd: centsToUsd(revenue?.total ?? merged.totalRevenue ?? merged.totalRevenueCents),
    customers: firstNumber(merged.customers, merged.customerCount),
    activeSubscriptions: firstNumber(merged.activeSubscriptions, merged.activeSubscriptionCount, merged.subscriptions),
    profitMarginLast30Days: normalizePercent(merged.profitMarginLast30Days ?? merged.profitMargin),
    growth30d: normalizePercent(merged.growth30d ?? merged.growth30Days),
    growthMRR30d: centsToUsd(merged.growthMRR30d ?? merged.mrrGrowth30d ?? merged.growthMrr30d),
    visitorsLast30Days: firstNumber(merged.visitorsLast30Days, merged.monthlyVisitors, merged.visitors30d),
    revenuePerVisitor: centsToUsd(merged.revenuePerVisitor ?? merged.rpv),
    googleSearchImpressionsLast30Days: firstNumber(merged.googleSearchImpressionsLast30Days, merged.searchImpressions30d),
    rank: firstNumber(merged.rank),
    onSale: asBoolean(merged.onSale),
    askingPriceUsd: centsToUsd(merged.askingPrice ?? merged.askingPriceCents),
    multiple: firstNumber(merged.multiple),
    xHandle: firstString(merged.xHandle, merged.twitterHandle, merged.twitter, merged.x),
    xFollowerCount: firstNumber(merged.xFollowerCount, merged.twitterFollowerCount),
    isMerchantOfRecord: asBoolean(merged.isMerchantOfRecord),
    techStack,
    founderCount,
    hasKnownFounderData: founderCount !== null,
    cofounders,
    raw: { list: base, detail },
    detailError
  };
}

function normalizeFounderCount(value: unknown): number | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.length;
  }

  const record = asRecord(value);
  if (record) {
    const count = firstNumber(record.count, record.total);
    return count === 0 ? null : count;
  }

  const count = asNumber(value);
  if (count === null || count === 0) return null;
  return count;
}

function normalizePercent(value: unknown): number | null {
  const number = asNumber(value);
  if (number === null) return null;
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
  const text = asString(value);
  if (!text) return [];
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

export function dedupeBySlug(items: UnknownRecord[]): UnknownRecord[] {
  const bySlug = new Map<string, UnknownRecord>();
  for (const item of items) {
    const slug = firstString(item.slug, item.handle, item.id);
    if (!slug) continue;
    bySlug.set(slug, { ...(bySlug.get(slug) ?? {}), ...item });
  }
  return [...bySlug.values()];
}
