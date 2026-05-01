export type LogLevel = "silent" | "info" | "debug";

type LogFields = Record<string, string | number | boolean | null | undefined>;

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
} as const;

export class Logger {
  constructor(private readonly level: LogLevel) {}

  banner(title: string): void {
    if (!this.shouldInfo()) return;
    this.line(`${color("🚀", "magenta")} ${color(title, "bold")}`);
  }

  phase(message: string): void {
    if (!this.shouldInfo()) return;
    this.blank();
    this.line(color(message, "cyan"));
  }

  step(message: string): void {
    if (!this.shouldInfo()) return;
    this.line(`   ${message}`);
  }

  progress(message: string): void {
    if (!this.shouldInfo()) return;
    this.line(`   ${message}`);
  }

  info(message: string): void {
    if (!this.shouldInfo()) return;
    this.line(message);
  }

  success(message: string): void {
    if (!this.shouldInfo()) return;
    this.line(`${color("✅", "green")} ${message}`);
  }

  warn(message: string, fields?: LogFields): void {
    if (!this.shouldInfo()) return;
    this.line(`${color("⚠️", "yellow")} ${message}`);
    this.fields(fields);
  }

  error(message: string, fields?: LogFields): void {
    if (this.level === "silent") {
      this.line(`❌ ${message}`, true);
      return;
    }
    this.line(`${color("❌", "red")} ${message}`, true);
    this.fields(fields, true);
  }

  debug(message: string, fields?: LogFields): void {
    if (this.level !== "debug") return;
    this.line(`${color("debug", "dim")} ${message}`);
    this.fields(fields);
  }

  summary(title: string, lines: string[]): void {
    if (this.level === "silent" && !title.includes("complete")) return;
    this.blank();
    this.line(`${color("🎯", "magenta")} ${color(title, "bold")}`);
    for (const line of lines) this.line(line);
  }

  fileWritten(path: string): void {
    if (!this.shouldInfo()) return;
    this.line(`${color("📦", "blue")} Wrote ${path}`);
  }

  isDebug(): boolean {
    return this.level === "debug";
  }

  private shouldInfo(): boolean {
    return this.level === "info" || this.level === "debug";
  }

  private fields(fields?: LogFields, stderr = false): void {
    if (!fields) return;
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === "") continue;
      this.line(`   ${key}: ${value}`, stderr);
    }
  }

  private blank(): void {
    this.line("");
  }

  private line(message: string, stderr = false): void {
    if (stderr) {
      console.error(message);
      return;
    }
    console.log(message);
  }
}

export function createLogger(level: LogLevel): Logger {
  return new Logger(level);
}

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === "silent" || value === "info" || value === "debug") return value;
  return "info";
}

function color(text: string, colorName: keyof typeof COLORS): string {
  return `${COLORS[colorName]}${text}${COLORS.reset}`;
}
