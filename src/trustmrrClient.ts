import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { FetchQuery, QueryLog, UnknownRecord } from "./types.js";
import { asArray, asNumber, asRecord, sleep } from "./utils.js";

type PageResult = {
  items: UnknownRecord[];
  raw: UnknownRecord;
  hasNextPage: boolean;
};

export class TrustMrrClient {
  private lastRequestAt = 0;

  constructor(private readonly config: AppConfig, private readonly logger: Logger) {}

  async fetchQuery(query: FetchQuery): Promise<{ items: UnknownRecord[]; rawPages: UnknownRecord[]; log: QueryLog }> {
    const items: UnknownRecord[] = [];
    const rawPages: UnknownRecord[] = [];
    let page = 1;
    let error: string | null = null;

    while (true) {
      if (this.config.maxPages !== null && page > this.config.maxPages) break;
      try {
        const result = await this.fetchListPage(query, page);
        this.logger.progress(`📄 Page ${page}: ${result.items.length} items`);
        rawPages.push({ query: query.name, page, response: result.raw });
        items.push(...result.items);
        if (!result.hasNextPage || result.items.length === 0) break;
        page += 1;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : "Unknown TrustMRR list fetch error.";
        break;
      }
    }

    return {
      items,
      rawPages,
      log: {
        name: query.name,
        params: this.queryToParams(query),
        pagesFetched: rawPages.length,
        itemsCollected: items.length,
        error
      }
    };
  }

  async fetchDetail(slug: string): Promise<UnknownRecord> {
    const endpoint = `/startups/${encodeURIComponent(slug)}`;
    return this.request(endpoint);
  }

  private async fetchListPage(query: FetchQuery, page: number): Promise<PageResult> {
    const params = this.queryToParams(query);
    params.page = page;
    params.limit = this.config.limit;
    this.logger.debug("Fetching TrustMRR page", {
      endpoint: "/startups",
      query: query.name,
      page,
      params: formatParams(params)
    });
    const raw = await this.request("/startups", params);
    const items = extractItems(raw);
    return {
      items,
      raw,
      hasNextPage: hasNextPage(raw, page, items.length, this.config.limit)
    };
  }

  private queryToParams(query: FetchQuery): UnknownRecord {
    const params: UnknownRecord = {
      minMrr: query.minMrr,
      sort: query.sort
    };
    if (query.maxMrr !== undefined) params.maxMrr = query.maxMrr;
    if (query.category) params.category = query.category;
    return params;
  }

  private async request(path: string, params: UnknownRecord = {}): Promise<UnknownRecord> {
    await this.rateLimit();
    const url = new URL(`${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json"
        }
      });

      if (response.status === 429 && attempt < attempts) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : this.config.requestDelayMs * 2;
        this.logger.warn("Rate limited by TrustMRR", {
          Endpoint: path,
          Attempt: `${attempt}/${attempts}`,
          Waiting: `${waitMs}ms`
        });
        await sleep(waitMs);
        continue;
      }

      const text = await response.text();
      const parsed = parseJson(text);

      if (!response.ok) {
        const message = asRecord(parsed)?.message ?? asRecord(parsed)?.error ?? response.statusText;
        throw new Error(`TrustMRR request failed (${response.status}) for ${path} with params ${formatParams(params)}: ${String(message)}`);
      }

      const record = asRecord(parsed);
      if (!record) {
        throw new Error(`TrustMRR returned an unexpected non-object response for ${path}.`);
      }
      return record;
    }

    throw new Error(`TrustMRR request failed after retries for ${path}.`);
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = Math.max(0, this.config.requestDelayMs - elapsed);
    if (waitMs > 0) {
      if (this.logger.isDebug() || waitMs > 5000) this.logger.progress(`⏳ Waiting ${waitMs}ms before next TrustMRR request`);
      await sleep(waitMs);
    }
    this.lastRequestAt = Date.now();
  }
}

export function formatParams(params: UnknownRecord): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function extractItems(raw: UnknownRecord): UnknownRecord[] {
  const candidates = [
    raw.data,
    raw.startups,
    raw.items,
    raw.results,
    asRecord(raw.data)?.startups,
    asRecord(raw.data)?.items,
    asRecord(raw.data)?.results
  ];
  for (const candidate of candidates) {
    const items = asArray(candidate).map(asRecord).filter((item): item is UnknownRecord => item !== null);
    if (items.length > 0) return items;
  }
  return [];
}

function hasNextPage(raw: UnknownRecord, page: number, itemCount: number, limit: number): boolean {
  const meta = asRecord(raw.meta) ?? asRecord(raw.pagination) ?? asRecord(asRecord(raw.data)?.meta);
  const currentPage = asNumber(meta?.page) ?? asNumber(meta?.currentPage) ?? page;
  const totalPages = asNumber(meta?.totalPages) ?? asNumber(meta?.lastPage);
  const hasNext = meta?.hasNextPage ?? meta?.hasNext;
  if (typeof hasNext === "boolean") return hasNext;
  if (totalPages !== null) return currentPage < totalPages;
  return itemCount >= limit;
}
