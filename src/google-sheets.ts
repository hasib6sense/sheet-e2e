import { google, sheets_v4 } from "googleapis";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getCredentialsPath,
  getResultsFile,
  getSkipTabs,
  getSpreadsheetId,
  getTabSuite,
} from "./config";
import { formatErrorForSheet } from "./format-error";
import {
  indexLocalPlaywrightTests,
  localSpecFileForTc,
  normalizeTcId,
} from "./local-specs";
import type { E2eTabInfo, E2eTestCase } from "./types";

const COL = {
  testScenario: ["Test Scenario"],
  testCaseId: ["Test Case ID", "Test Case ID "],
  testCase: ["Test Case"],
  category: ["Category"],
  uiStatus: ["UI Status"],
  playwright: ["Playwright"],
  comment: ["Comment", "Comment "],
};

function findColIndex(headers: string[], aliases: string[]) {
  for (let i = 0; i < headers.length; i += 1) {
    const h = String(headers[i] ?? "").trim();
    if (aliases.some((a) => h === a.trim())) return i;
  }
  return -1;
}

function colLetter(index: number) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function createSheetsClient(): sheets_v4.Sheets {
  const credentialsPath = getCredentialsPath();

  if (!existsSync(credentialsPath)) {
    throw new Error(
      `Google credentials not found: ${credentialsPath}. Set GOOGLE_APPLICATION_CREDENTIALS to the path of the credentials.json file.`,
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function normalizeTabKey(name: string) {
  return name.trim().toLowerCase().replace(/[_\s-]+/g, "");
}

type TitlesCache = { at: number; titles: string[]; spreadsheetId: string };
let titlesCache: TitlesCache | null = null;

type CasesCache = {
  at: number;
  key: string;
  cases: E2eTestCase[];
  warnings: string[];
};
let casesCache: CasesCache | null = null;

const TITLES_TTL_MS = 60_000;
/** Avoid hammering Sheets on rapid runner refreshes (quota is 60 reads/min/user). */
const CASES_TTL_MS = 30_000;

export function clearSheetCaches() {
  titlesCache = null;
  casesCache = null;
}

async function getSpreadsheetTitles(sheets: sheets_v4.Sheets): Promise<string[]> {
  const spreadsheetId = getSpreadsheetId();
  if (
    titlesCache &&
    titlesCache.spreadsheetId === spreadsheetId &&
    Date.now() - titlesCache.at < TITLES_TTL_MS
  ) {
    return titlesCache.titles;
  }

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter(Boolean);
  titlesCache = { at: Date.now(), titles, spreadsheetId };
  return titles;
}

function matchSheetTabTitle(
  titles: string[],
  wanted: string,
): { title: string | null; warning?: string } {
  if (titles.includes(wanted)) return { title: wanted };

  const key = normalizeTabKey(wanted);
  const fuzzy = titles.find((t) => normalizeTabKey(t) === key);
  if (fuzzy) {
    return {
      title: fuzzy,
      warning: `Tab suite "${wanted}" matched sheet tab "${fuzzy}". Prefer exact sheet tab names in e2e/tab-suites.json.`,
    };
  }

  return {
    title: null,
    warning: `No spreadsheet tab matches "${wanted}". Check e2e/tab-suites.json against the sheet (e.g. Apply_Leave vs Apply Leave).`,
  };
}

/** Match tab-suites name to a real spreadsheet tab (Apply Leave ↔ Apply_Leave). */
async function resolveSheetTabTitle(
  sheets: sheets_v4.Sheets,
  wanted: string,
): Promise<{ title: string | null; warning?: string }> {
  const titles = await getSpreadsheetTitles(sheets);
  return matchSheetTabTitle(titles, wanted);
}

export async function listSheetTabNames(): Promise<string[]> {
  const sheets = createSheetsClient();
  const skip = getSkipTabs();
  const titles = await getSpreadsheetTitles(sheets);
  return titles.filter((name) => name && !skip.has(name));
}

function parseTabRows(allRows: string[][]) {
  if (!allRows.length) {
    return { headers: [] as string[], rows: [] as string[][], headerRowNumber: 1 };
  }

  let headerIndex = 0;
  for (let i = 0; i < Math.min(allRows.length, 30); i += 1) {
    if (findColIndex(allRows[i] ?? [], COL.testCaseId) >= 0) {
      headerIndex = i;
      break;
    }
  }

  const headers = allRows[headerIndex] ?? [];
  const rows = allRows.slice(headerIndex + 1);
  return { headers, rows, headerRowNumber: headerIndex + 1 };
}

async function readTabRows(sheets: sheets_v4.Sheets, tab: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `'${tab}'`,
  });
  return parseTabRows((res.data.values ?? []) as string[][]);
}

async function readTabsRowsBatch(
  sheets: sheets_v4.Sheets,
  tabs: string[],
): Promise<Map<string, ReturnType<typeof parseTabRows>>> {
  const out = new Map<string, ReturnType<typeof parseTabRows>>();
  if (!tabs.length) return out;

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: getSpreadsheetId(),
    ranges: tabs.map((t) => `'${t}'`),
  });

  for (let i = 0; i < tabs.length; i += 1) {
    const values = (res.data.valueRanges?.[i]?.values ?? []) as string[][];
    out.set(tabs[i], parseTabRows(values));
  }
  return out;
}

function isTcInLocalSpecs(tab: string, testCaseId: string): boolean {
  const local = indexLocalPlaywrightTests().get(tab);
  if (!local) return false;
  const key = normalizeTcId(testCaseId);
  return local.some((e) => normalizeTcId(e.testCaseId) === key);
}

/** Playwright runner is UI-only — Category API rows stay out of the case list. */
function isApiCategory(category: string): boolean {
  return category.trim().toUpperCase() === "API";
}

function rowToTestCase(tab: string, row: string[], headers: string[]): E2eTestCase | null {
  const idx = {
    testScenario: findColIndex(headers, COL.testScenario),
    tc: findColIndex(headers, COL.testCaseId),
    testCase: findColIndex(headers, COL.testCase),
    category: findColIndex(headers, COL.category),
    uiStatus: findColIndex(headers, COL.uiStatus),
    playwright: findColIndex(headers, COL.playwright),
    comment: findColIndex(headers, COL.comment),
  };

  if (idx.tc < 0) return null;

  const testCaseId = String(row[idx.tc] ?? "").trim();
  if (!testCaseId) return null;

  const category = idx.category >= 0 ? String(row[idx.category] ?? "").trim() : "";
  const suite = getTabSuite(tab);
  const hasSpec = Boolean(suite);
  const implemented = isTcInLocalSpecs(tab, testCaseId);
  const specFile = localSpecFileForTc(tab, testCaseId) ?? "";
  const runnable = implemented;
  const rawComment = idx.comment >= 0 ? String(row[idx.comment] ?? "").trim() : "";

  return {
    id: `${tab}::${testCaseId}`,
    tab,
    testCaseId,
    testScenario: idx.testScenario >= 0 ? String(row[idx.testScenario] ?? "") : "",
    testCase: idx.testCase >= 0 ? String(row[idx.testCase] ?? "") : "",
    category,
    uiStatus: idx.uiStatus >= 0 ? String(row[idx.uiStatus] ?? "") : "",
    playwright: idx.playwright >= 0 ? String(row[idx.playwright] ?? "") : "",
    comment: rawComment ? formatErrorForSheet(rawComment) : "",
    hasSpec,
    implemented,
    specFile,
    runnable,
  };
}

/** Sheet rows that match a TC declared in local Playwright spec files.
 *  Category === API rows are omitted (Playwright / runner are UI-only). */
export async function fetchImplementedTestCasesWithMeta(tabFilter?: string[]): Promise<{
  cases: E2eTestCase[];
  warnings: string[];
}> {
  const localIndex = indexLocalPlaywrightTests();
  let tabNames = [...localIndex.keys()];

  if (tabFilter?.length) {
    const wanted = new Set(tabFilter.map((t) => t.toLowerCase()));
    tabNames = tabNames.filter((t) => wanted.has(t.toLowerCase()));
  }

  const cacheKey = `${getSpreadsheetId()}::${tabNames.slice().sort().join("|")}`;
  if (
    casesCache &&
    casesCache.key === cacheKey &&
    Date.now() - casesCache.at < CASES_TTL_MS
  ) {
    return { cases: casesCache.cases, warnings: casesCache.warnings };
  }

  const sheets = createSheetsClient();
  const cases: E2eTestCase[] = [];
  const warnings: string[] = [];

  const pushLocalOnly = (tab: string, localEntries: { testCaseId: string; specFile: string }[]) => {
    for (const entry of localEntries) {
      cases.push({
        id: `${tab}::${entry.testCaseId}`,
        tab,
        testCaseId: entry.testCaseId,
        testScenario: "",
        testCase: entry.testCaseId,
        category: "UI",
        uiStatus: "",
        playwright: "",
        comment: "",
        hasSpec: true,
        implemented: true,
        specFile: entry.specFile,
        runnable: true,
      });
    }
  };

  try {
    const titles = await getSpreadsheetTitles(sheets);
    const resolvedBySuite = new Map<string, { title: string | null; warning?: string }>();
    const sheetTabsToRead: string[] = [];

    for (const tab of tabNames) {
      const resolved = matchSheetTabTitle(titles, tab);
      resolvedBySuite.set(tab, resolved);
      if (resolved.warning) warnings.push(resolved.warning);
      if (resolved.title) sheetTabsToRead.push(resolved.title);
    }

    const uniqueSheetTabs = [...new Set(sheetTabsToRead)];
    const rowsBySheetTab = await readTabsRowsBatch(sheets, uniqueSheetTabs);

    for (const tab of tabNames) {
      const localEntries = localIndex.get(tab)!;
      const localKeys = new Set(localEntries.map((e) => normalizeTcId(e.testCaseId)));
      const resolved = resolvedBySuite.get(tab)!;

      if (!resolved.title) {
        pushLocalOnly(tab, localEntries);
        continue;
      }

      const parsed = rowsBySheetTab.get(resolved.title);
      if (!parsed || !parsed.headers.length) {
        warnings.push(
          `Sheet tab "${resolved.title}" has no header row with Test Case ID.`,
        );
        pushLocalOnly(tab, localEntries);
        continue;
      }

      const { headers, rows } = parsed;
      const sheetByTc = new Map<string, E2eTestCase>();
      const apiLocalKeys = new Set<string>();
      for (const row of rows) {
        const tc = rowToTestCase(tab, row, headers);
        if (!tc) continue;
        const key = normalizeTcId(tc.testCaseId);
        if (!localKeys.has(key)) continue;
        if (isApiCategory(tc.category)) {
          apiLocalKeys.add(key);
          continue;
        }
        sheetByTc.set(key, tc);
      }

      for (const entry of localEntries) {
        const key = normalizeTcId(entry.testCaseId);
        if (apiLocalKeys.has(key)) continue;

        const fromSheet = sheetByTc.get(key);
        if (fromSheet) {
          cases.push({
            ...fromSheet,
            tab,
            hasSpec: true,
            implemented: true,
            runnable: true,
            specFile: entry.specFile,
          });
        } else {
          cases.push({
            id: `${tab}::${entry.testCaseId}`,
            tab,
            testCaseId: entry.testCaseId,
            testScenario: "",
            testCase: entry.testCaseId,
            category: "UI",
            uiStatus: "",
            playwright: "",
            comment: "",
            hasSpec: true,
            implemented: true,
            specFile: entry.specFile,
            runnable: true,
          });
        }
      }
    }
  } catch (err) {
    const msg = (err as Error).message || String(err);
    for (const tab of tabNames) {
      warnings.push(`Sheet read failed for "${tab}": ${msg}`);
      pushLocalOnly(tab, localIndex.get(tab)!);
    }
  }

  casesCache = { at: Date.now(), key: cacheKey, cases, warnings };
  return { cases, warnings };
}

export async function fetchImplementedTestCases(tabFilter?: string[]): Promise<E2eTestCase[]> {
  const { cases } = await fetchImplementedTestCasesWithMeta(tabFilter);
  return cases;
}

/** @deprecated Use fetchImplementedTestCases */
export async function fetchAllTestCases(tabFilter?: string[]): Promise<E2eTestCase[]> {
  return fetchImplementedTestCases(tabFilter);
}

/** Build module dropdown stats from an already-fetched case list (no extra sheet reads). */
export function buildTabInfoFromCases(cases: E2eTestCase[]): E2eTabInfo[] {
  const localIndex = indexLocalPlaywrightTests();
  return [...localIndex.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entries]) => {
      const suite = getTabSuite(name);
      const tabCases = cases.filter((c) => c.tab === name);
      return {
        name,
        hasSpec: Boolean(suite),
        specFiles: suite?.specs ?? entries.map((e) => e.specFile),
        caseCount: tabCases.length,
        implementedCount: entries.length,
        runnableCount: tabCases.filter((c) => c.runnable).length,
      };
    });
}

export async function fetchTabInfo(): Promise<E2eTabInfo[]> {
  const { cases } = await fetchImplementedTestCasesWithMeta();
  return buildTabInfoFromCases(cases);
}

function extractTcId(title: string) {
  const m = title.match(/^(TC[-_]?\d+)/i);
  return m ? m[1] : null;
}

type ParsedResult = { tcId: string; status: string; error: string; title: string };

function walkSuites(
  suite: { specs?: unknown[]; suites?: unknown[] },
  out: Map<string, ParsedResult>,
) {
  for (const spec of (suite.specs ?? []) as {
    title?: string;
    tests?: {
      projectName?: string;
      results?: { status?: string; errors?: { message?: string }[] }[];
    }[];
  }[]) {
    const tcId = extractTcId(spec.title ?? "");
    if (!tcId) continue;

    const tests = spec.tests ?? [];
    const chromiumTest =
      tests.find(
        (t) => t.projectName === "chromium" || t.projectName === "chromium-unauth",
      ) ?? tests[0];
    if (!chromiumTest) continue;

    const results = chromiumTest.results ?? [];
    const failed = results.some((r) => r.status === "failed" || r.status === "timedOut");
    const last = results[results.length - 1];
    const status = failed ? "failed" : (last?.status ?? "skipped");

    let error = "";
    for (const r of results) {
      for (const e of r.errors ?? []) {
        if (e.message) error = error ? `${error}\n---\n${e.message}` : e.message;
      }
    }

    out.set(normalizeTcId(tcId), {
      tcId,
      title: spec.title ?? "",
      status,
      error: error.trim(),
    });
  }

  for (const child of (suite.suites ?? []) as { specs?: unknown[]; suites?: unknown[] }[]) {
    walkSuites(child, out);
  }
}

export function parsePlaywrightReport(reportPath: string): Map<string, ParsedResult> {
  const raw = readFileSync(reportPath, "utf8");
  const report = JSON.parse(raw) as { suites?: { specs?: unknown[]; suites?: unknown[] }[] };
  const byTc = new Map<string, ParsedResult>();
  for (const suite of report.suites ?? []) {
    walkSuites(suite, byTc);
  }
  return byTc;
}

export async function syncTabResults(
  sheets: sheets_v4.Sheets,
  tab: string,
  resultsByTc: Map<string, ParsedResult>,
): Promise<number> {
  const resolved = await resolveSheetTabTitle(sheets, tab);
  if (!resolved.title) {
    throw new Error(resolved.warning || `No spreadsheet tab matches "${tab}".`);
  }
  const sheetTab = resolved.title;
  const { headers, rows, headerRowNumber } = await readTabRows(sheets, sheetTab);

  const idx = {
    tc: findColIndex(headers, COL.testCaseId),
    category: findColIndex(headers, COL.category),
    uiStatus: findColIndex(headers, COL.uiStatus),
    playwright: findColIndex(headers, COL.playwright),
    comment: findColIndex(headers, COL.comment),
  };

  if (idx.tc < 0 || idx.uiStatus < 0 || idx.playwright < 0) {
    throw new Error(`Tab "${sheetTab}": missing required columns.`);
  }

  const batch: { range: string; values: string[][] }[] = [];
  let updated = 0;
  const spreadsheetId = getSpreadsheetId();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const sheetRow = headerRowNumber + 1 + i;
    const tcRaw = row[idx.tc];
    if (!tcRaw) continue;

    const category = idx.category >= 0 ? String(row[idx.category] ?? "").trim() : "";
    if (category.toUpperCase() === "API") continue;

    const result = resultsByTc.get(normalizeTcId(tcRaw));
    if (!result) continue;

    const uiStatus = result.status === "passed" ? "Passed" : "Failed";
    const playwright = "Implemented";
    const comment =
      result.status === "passed" ? "" : formatErrorForSheet(result.error, result.title);

    const writes = [
      { col: idx.uiStatus, value: uiStatus },
      { col: idx.playwright, value: playwright },
    ];
    if (idx.comment >= 0) writes.push({ col: idx.comment, value: comment });

    for (const w of writes) {
      batch.push({
        range: `'${sheetTab}'!${colLetter(w.col)}${sheetRow}`,
        values: [[w.value]],
      });
    }
    updated += 1;
  }

  if (!batch.length) return 0;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: batch },
  });

  return updated;
}

export async function syncSheetsForTabs(
  tabs: string[],
  reportPath?: string,
): Promise<string[]> {
  if (process.env.E2E_NO_SHEET_SYNC === "1") {
    return ["Sheet sync skipped (E2E_NO_SHEET_SYNC=1)."];
  }

  const resolvedReport = resolve(reportPath ?? getResultsFile());
  if (!existsSync(resolvedReport)) {
    return [`Sheet sync skipped: report not found at ${resolvedReport}`];
  }

  const resultsByTc = parsePlaywrightReport(resolvedReport);
  if (!resultsByTc.size) {
    return ["Sheet sync skipped: no TC tests in report."];
  }

  const sheets = createSheetsClient();
  const summary: string[] = [];

  for (const tab of tabs) {
    try {
      const n = await syncTabResults(sheets, tab, resultsByTc);
      summary.push(`${tab}: ${n} row(s) updated`);
    } catch (err) {
      summary.push(`${tab}: sync failed — ${(err as Error).message}`);
    }
  }

  clearSheetCaches();
  return summary;
}
