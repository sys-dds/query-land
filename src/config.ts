import dotenv from "dotenv";
import { parseLogLevel, type LogLevel } from "./logger.js";
import { parseMoneyScaleMode, type MoneyScaleMode } from "./money.js";

dotenv.config();

export type AppConfig = {
  apiKey: string | null;
  baseUrl: string;
  minMrrCents: number;
  maxMrrCents: number;
  limit: number;
  maxPages: number | null;
  fetchDetails: boolean;
  topN: number;
  requestDelayMs: number;
  logLevel: LogLevel;
  legacyOutputsEnabled: boolean;
  moneyScaleMode: MoneyScaleMode;
};

export type SafeConfigSummary = Omit<AppConfig, "apiKey" | "baseUrl" | "maxPages"> & {
  apiKeyLoaded: boolean;
  maxPages: number | "all";
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
  const apiKey = process.env.TRUSTMRR_API_KEY ?? null;

  return {
    apiKey,
    baseUrl: "https://trustmrr.com/api/v1",
    minMrrCents: numberFromEnv("MIN_MRR_CENTS", 100000),
    maxMrrCents: numberFromEnv("MAX_MRR_CENTS", 1000000),
    limit: numberFromEnv("LIMIT", 50),
    maxPages: optionalNumberFromEnv("MAX_PAGES"),
    fetchDetails: booleanFromEnv("FETCH_DETAILS", true),
    topN: numberFromEnv("TOP_N", 50),
    requestDelayMs: numberFromEnv("REQUEST_DELAY_MS", 3500),
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    legacyOutputsEnabled: booleanFromEnv("LEGACY_OUTPUTS_ENABLED", false),
    moneyScaleMode: parseMoneyScaleMode(process.env.TRUSTMRR_MONEY_SCALE)
  };
}

export function safeConfigSummary(config: AppConfig): SafeConfigSummary {
  return {
    minMrrCents: config.minMrrCents,
    maxMrrCents: config.maxMrrCents,
    limit: config.limit,
    maxPages: config.maxPages ?? "all",
    fetchDetails: config.fetchDetails,
    topN: config.topN,
    requestDelayMs: config.requestDelayMs,
    logLevel: config.logLevel,
    legacyOutputsEnabled: config.legacyOutputsEnabled,
    moneyScaleMode: config.moneyScaleMode,
    apiKeyLoaded: Boolean(config.apiKey)
  };
}
