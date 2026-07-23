import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { E2eTabSuite, SheetE2eConfigFile } from "./types";

const CONFIG_CANDIDATES = [
  "sheet-e2e.config.json",
  "e2e/sheet-e2e.config.json",
  "e2e/tab-suites.json",
  "src/lib/e2e/tab-suites.json",
];

let cachedConfig: ResolvedConfig | null = null;

export type ResolvedConfig = {
  spreadsheetId: string;
  credentialsPath: string;
  resultsFile: string;
  skipTabs: Set<string>;
  tabSuites: E2eTabSuite[];
  tabSuitesPath: string | null;
  cwd: string;
};

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function findConfigFile(cwd: string): { path: string; data: unknown } | null {
  const fromEnv = process.env.SHEET_E2E_CONFIG?.trim();
  if (fromEnv) {
    const full = resolve(cwd, fromEnv);
    if (existsSync(full)) return { path: full, data: readJsonFile(full) };
  }

  for (const rel of CONFIG_CANDIDATES) {
    const full = resolve(cwd, rel);
    if (!existsSync(full)) continue;
    return { path: full, data: readJsonFile(full) };
  }
  return null;
}

function normalizeSuites(data: unknown, configPath: string | null): {
  suites: E2eTabSuite[];
  suitesPath: string | null;
  fileConfig: SheetE2eConfigFile;
} {
  if (Array.isArray(data)) {
    return {
      suites: data as E2eTabSuite[],
      suitesPath: configPath,
      fileConfig: {},
    };
  }

  const fileConfig = (data ?? {}) as SheetE2eConfigFile;
  if (Array.isArray(fileConfig.tabSuites) && fileConfig.tabSuites.length) {
    return { suites: fileConfig.tabSuites, suitesPath: configPath, fileConfig };
  }

  if (fileConfig.tabSuitesPath) {
    const suitesFull = resolve(process.cwd(), fileConfig.tabSuitesPath);
    if (existsSync(suitesFull)) {
      const suitesData = readJsonFile(suitesFull);
      if (Array.isArray(suitesData)) {
        return {
          suites: suitesData as E2eTabSuite[],
          suitesPath: suitesFull,
          fileConfig,
        };
      }
    }
  }

  return { suites: [], suitesPath: configPath, fileConfig };
}

/** Load host config from env + sheet-e2e.config.json / tab-suites.json. */
export function loadConfig(cwd = process.cwd(), forceReload = false): ResolvedConfig {
  if (cachedConfig && cachedConfig.cwd === cwd && !forceReload) return cachedConfig;

  const found = findConfigFile(cwd);
  const { suites, suitesPath, fileConfig } = found
    ? normalizeSuites(found.data, found.path)
    : { suites: [] as E2eTabSuite[], suitesPath: null, fileConfig: {} as SheetE2eConfigFile };

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

  const skipList = fileConfig.skipTabs?.length
    ? fileConfig.skipTabs
    : ["Summery"];
  const skipTabs = new Set(skipList);

  cachedConfig = {
    spreadsheetId,
    credentialsPath,
    resultsFile,
    skipTabs,
    tabSuites: suites,
    tabSuitesPath: suitesPath,
    cwd,
  };
  return cachedConfig;
}

export function clearConfigCache() {
  cachedConfig = null;
}

export function getSpreadsheetId(): string {
  const id = loadConfig().spreadsheetId;
  if (!id) {
    throw new Error(
      "GOOGLE_SPREADSHEET_ID is not set. Add it to .env or sheet-e2e.config.json.",
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
