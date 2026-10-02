import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const LOG_PREFIX = "[opencode.sidebar.modern.gitstats]";
const LOG_FILE = join(homedir(), ".local/share/opencode/log/gitstatus.log");

export function writeLog(level: "INFO" | "WARN" | "ERROR", message: string) {
  const line = `[${new Date().toISOString()}] [${level}] ${LOG_PREFIX} ${message}\n`;
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, line);
  } catch {}
}

export const log = {
  info: (msg: string) => {
    console.log(`${LOG_PREFIX} ${msg}`);
    writeLog("INFO", msg);
  },
  warn: (msg: string) => {
    console.warn(`${LOG_PREFIX} ${msg}`);
    writeLog("WARN", msg);
  },
  error: (msg: string) => {
    console.error(`${LOG_PREFIX} ${msg}`);
    writeLog("ERROR", msg);
  },
};

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + "…";
}

export function branchMaxLength(
  panelWidth: number,
  prefixWidth: number,
  suffixWidth = 0,
): number {
  const borderWidth = 2;
  const effectiveWidth = panelWidth > 0 ? panelWidth : 38;
  return Math.max(
    1,
    effectiveWidth - borderWidth - prefixWidth - suffixWidth,
  );
}
