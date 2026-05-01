import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  apiKey: string;
  baseUrl: string;
  minMrrCents: number;
  maxMrrCents: number;
  limit: number;
  maxPages: number | null;
  fetchDetails: boolean;
  topN: number;
  requestDelayMs: number;
};

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return parsed;
}

function optionalNumberFromEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number when set.`);
  }
  return parsed;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "y"].includes(raw.toLowerCase());
}

export function loadConfig(): AppConfig {
  const apiKey = process.env.TRUSTMRR_API_KEY;
  if (!apiKey) {
    throw new Error("TRUSTMRR_API_KEY is required. Create a local .env from .env.example and rerun the analyser.");
  }

  return {
    apiKey,
    baseUrl: "https://trustmrr.com/api/v1",
    minMrrCents: numberFromEnv("MIN_MRR_CENTS", 100000),
    maxMrrCents: numberFromEnv("MAX_MRR_CENTS", 1000000),
    limit: numberFromEnv("LIMIT", 50),
    maxPages: optionalNumberFromEnv("MAX_PAGES"),
    fetchDetails: booleanFromEnv("FETCH_DETAILS", true),
    topN: numberFromEnv("TOP_N", 50),
    requestDelayMs: numberFromEnv("REQUEST_DELAY_MS", 3500)
  };
}
