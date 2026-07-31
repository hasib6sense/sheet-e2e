import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { E2eTabSuite, SheetE2eConfigFile } from "./types";

/** Optional JSON config — env vars take precedence when set. */
const CONFIG_FILE_CANDIDATES = [
  "sheet-e2e.config.json",
  "e2e/sheet-e2e.config.json",
];

const TAB_SUITES_CANDIDATES = [
  "e2e/tab-suites.json",
  "src/lib/e2e/tab-suites.json",
];

let cachedConfig: ResolvedConfig | null = null;
let loadedDotEnvCwd: string | null = null;

export type ResolvedConfig = {
  spreadsheetId: string;
  credentialsPath: string;
  resultsFile: string;
  /** Jest JSON output path for Unit Test engine sync. */
  unitResultsFile: string;
  skipTabs: Set<string>;
  tabSuites: E2eTabSuite[];
  tabSuitesPath: string | null;
  cwd: string;
};

/** Load host `.env` into process.env (does not override existing env). */
function loadHostDotEnv(cwd: string) {
  if (loadedDotEnvCwd === cwd) return;
  loadedDotEnvCwd = cwd;
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findOptionalConfigFile(cwd: string): { path: string; data: SheetE2eConfigFile } | null {
  const fromEnv = process.env.SHEET_E2E_CONFIG?.trim();
  if (fromEnv) {
    const full = resolve(cwd, fromEnv);
    if (existsSync(full)) {
      return { path: full, data: readJsonFile(full) as SheetE2eConfigFile };
    }
  }

  for (const rel of CONFIG_FILE_CANDIDATES) {
    const full = resolve(cwd, rel);
    if (!existsSync(full)) continue;
    return { path: full, data: readJsonFile(full) as SheetE2eConfigFile };
  }
  return null;
}

function resolveTabSuitesPath(cwd: string, fileConfig: SheetE2eConfigFile): string | null {
  const fromEnv =
    process.env.E2E_TAB_SUITES_PATH?.trim() ||
    process.env.SHEET_E2E_TAB_SUITES_PATH?.trim();
  if (fromEnv) {
    const full = resolve(cwd, fromEnv);
    if (existsSync(full)) return full;
  }

  if (fileConfig.tabSuitesPath?.trim()) {
    const full = resolve(cwd, fileConfig.tabSuitesPath.trim());
    if (existsSync(full)) return full;
  }

  for (const rel of TAB_SUITES_CANDIDATES) {
    const full = resolve(cwd, rel);
    if (existsSync(full)) return full;
  }

  return null;
}

function loadTabSuites(
  cwd: string,
  fileConfig: SheetE2eConfigFile,
): { suites: E2eTabSuite[]; suitesPath: string | null } {
  if (Array.isArray(fileConfig.tabSuites) && fileConfig.tabSuites.length) {
    return { suites: fileConfig.tabSuites, suitesPath: null };
  }

  const suitesPath = resolveTabSuitesPath(cwd, fileConfig);
  if (!suitesPath) return { suites: [], suitesPath: null };

  const data = readJsonFile(suitesPath);
  if (!Array.isArray(data)) {
    throw new Error(`Tab suites file must be a JSON array: ${suitesPath}`);
  }
  return { suites: data as E2eTabSuite[], suitesPath };
}

function parseSkipTabs(fileConfig: SheetE2eConfigFile): Set<string> {
  const fromEnv = process.env.E2E_SKIP_TABS?.trim();
  if (fromEnv) {
    return new Set(
      fromEnv
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  if (fileConfig.skipTabs?.length) return new Set(fileConfig.skipTabs);
  return new Set(["Summery"]);
}

/** Load host config from env (preferred) + optional sheet-e2e.config.json / tab-suites.json. */
export function loadConfig(cwd = process.cwd(), forceReload = false): ResolvedConfig {
  if (cachedConfig && cachedConfig.cwd === cwd && !forceReload) return cachedConfig;

  loadHostDotEnv(cwd);

  const found = findOptionalConfigFile(cwd);
  const fileConfig = found?.data ?? {};
  const { suites, suitesPath } = loadTabSuites(cwd, fileConfig);

  const spreadsheetId =
    process.env.GOOGLE_SPREADSHEET_ID?.trim() ||
    fileConfig.spreadsheetId?.trim() ||
    "";

  const credentialsPath = resolve(
    cwd,
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      fileConfig.credentialsPath?.trim() ||
      join("credentials", "credentials.json"),
  );

  const resultsFile =
    process.env.E2E_RESULTS_FILE?.trim() ||
    fileConfig.resultsFile?.trim() ||
    "playwright-results.json";

  const unitResultsFile =
    process.env.E2E_UNIT_RESULTS_FILE?.trim() || "jest-results.json";

  cachedConfig = {
    spreadsheetId,
    credentialsPath,
    resultsFile,
    unitResultsFile,
    skipTabs: parseSkipTabs(fileConfig),
    tabSuites: suites,
    tabSuitesPath: suitesPath,
    cwd,
  };
  return cachedConfig;
}

export function clearConfigCache() {
  cachedConfig = null;
  loadedDotEnvCwd = null;
}

export function getSpreadsheetId(): string {
  const id = loadConfig().spreadsheetId;
  if (!id) {
    throw new Error(
      "GOOGLE_SPREADSHEET_ID is not set. Add it to .env (or optional sheet-e2e.config.json).",
    );
  }
  return id;
}

export function getCredentialsPath(): string {
  return loadConfig().credentialsPath;
}

export function getResultsFile(): string {
  return loadConfig().resultsFile;
}

export function getUnitResultsFile(): string {
  return loadConfig().unitResultsFile;
}

export function getSkipTabs(): Set<string> {
  return loadConfig().skipTabs;
}

export function getTabSuites(): E2eTabSuite[] {
  return loadConfig().tabSuites;
}

export function getTabSuite(tab: string): E2eTabSuite | undefined {
  return getTabSuites().find((s) => s.tab.toLowerCase() === tab.toLowerCase());
}

export function tabsWithSpecs(): string[] {
  return getTabSuites().map((s) => s.tab);
}

/** @deprecated Prefer getSpreadsheetId() — kept for host re-exports. */
export function E2E_SPREADSHEET_ID(): string {
  return getSpreadsheetId();
}
