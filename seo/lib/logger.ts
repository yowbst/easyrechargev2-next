import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { dataDir } from "./config";

const logsDir = resolve(dataDir, "logs");

export interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

/** Logs to the console and to `seo/data/logs/<date>-<name>.log` (JSON lines). */
export function createLogger(name: string): Logger {
  mkdirSync(logsDir, { recursive: true });
  const file = resolve(logsDir, `${new Date().toISOString().slice(0, 10)}-${name}.log`);

  const write = (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => {
    appendFileSync(file, JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...data }) + "\n");
    const line = `[${level.toUpperCase()}] ${message}`;
    if (level === "error") console.error(line, data ?? "");
    else console.log(line);
  };

  return {
    info: (m, d) => write("info", m, d),
    warn: (m, d) => write("warn", m, d),
    error: (m, d) => write("error", m, d),
  };
}
