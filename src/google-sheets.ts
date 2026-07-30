import { google, sheets_v4 } from "googleapis";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getCredentialsPath,
  getResultsFile,
  getUnitResultsFile,
  getSkipTabs,
  getSpreadsheetId,
  getTabSuite,
  getTabSuites,
} from "./config";
import { formatErrorForSheet } from "./format-error";
import {
  indexLocalPlaywrightTests,
  indexLocalUnitTests,
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

type SheetMetaCache = {
  at: number;
  spreadsheetId: string;
  byTitle: Map<string, number>;
};
let sheetMetaCache: SheetMetaCache | null = null;

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
  sheetMetaCache = null;
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

async function getSheetIdByTitle(
  sheets: sheets_v4.Sheets,
  title: string,
): Promise<number | null> {
  const spreadsheetId = getSpreadsheetId();
  if (
    !sheetMetaCache ||
    sheetMetaCache.spreadsheetId !== spreadsheetId ||
    Date.now() - sheetMetaCache.at >= TITLES_TTL_MS
  ) {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    });
    const byTitle = new Map<string, number>();
    for (const s of meta.data.sheets ?? []) {
      const t = s.properties?.title ?? "";
      const id = s.properties?.sheetId;
      if (t && typeof id === "number") byTitle.set(t, id);
    }
    sheetMetaCache = { at: Date.now(), spreadsheetId, byTitle };
  }
  return sheetMetaCache.byTitle.get(title) ?? null;
}

type Rgb = { red: number; green: number; blue: number };

/** Soft badge colors for UI Status / Playwright columns (Google Sheets). */
const STATUS_STYLES: Record<string, { bg: Rgb; fg: Rgb }> = {
  passed: {
    bg: { red: 0.902, green: 0.957, blue: 0.918 },
    fg: { red: 0.075, green: 0.451, blue: 0.2 },
  },
  failed: {
    bg: { red: 0.988, green: 0.91, blue: 0.902 },
    fg: { red: 0.773, green: 0.133, blue: 0.122 },
  },
  "not implemented": {
    bg: { red: 0.945, green: 0.953, blue: 0.957 },
    fg: { red: 0.373, green: 0.388, blue: 0.408 },
  },
  implemented: {
    bg: { red: 0.91, green: 0.941, blue: 1 },
    fg: { red: 0.102, green: 0.333, blue: 0.859 },
  },
};

function statusStyle(status: string) {
  return STATUS_STYLES[status.trim().toLowerCase()] ?? null;
}

async function applyStatusCellFormats(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  cells: { row: number; col: number; status: string }[],
) {
  const requests: sheets_v4.Schema$Request[] = [];

  for (const cell of cells) {
    const style = statusStyle(cell.status);
    if (!style) continue;
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: cell.row - 1,
          endRowIndex: cell.row,
          startColumnIndex: cell.col,
          endColumnIndex: cell.col + 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: style.bg,
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            textFormat: {
              foregroundColor: style.fg,
              bold: true,
              fontSize: 10,
            },
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)",
      },
    });
  }

  if (!requests.length) return;

  // Sheets API caps request size; chunk to stay safe on large tabs.
  const CHUNK = 400;
  for (let i = 0; i < requests.length; i += CHUNK) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: requests.slice(i, i + CHUNK) },
    });
  }
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

/** Three-engine category model.
 *  - "playwright"  → browser E2E (Playwright CLI)
 *  - "unit-test"   → component/unit test (Jest CLI)
 *  - "api"         → API automation, hidden entirely from runner
 *  - "unknown"     → blank / legacy value, treated as "playwright" in runner
 */
export type CategoryEngine = "playwright" | "unit-test" | "api" | "unknown";
export function categorizeEngine(category: string): CategoryEngine {
  const c = category.trim().toLowerCase();
  if (c === "api") return "api";
  if (c === "playwright") return "playwright";
  if (c === "ui") return "unit-test";
  return "unknown";
}

type SyncEngine = "playwright" | "unit-test";

/** Playwright runner hides API rows entirely. */
function isApiCategory(category: string): boolean {
  return categorizeEngine(category) === "api";
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

/** Sheet + local cases for mapped tabs.
 *  Category === API rows are omitted. Category === UI rows are included for the Unit Test engine. */
export async function fetchImplementedTestCasesWithMeta(tabFilter?: string[]): Promise<{
  cases: E2eTestCase[];
  warnings: string[];
}> {
  const localIndex = indexLocalPlaywrightTests();
  const unitIndex = indexLocalUnitTests();
  // Include every tab-suites entry (even when the Playwright spec is empty/commented)
  // so Unit Test sheet rows still appear under that module.
  let tabNames = Array.from(
    new Set([
      ...getTabSuites().map((s) => s.tab),
      ...Array.from(localIndex.keys()),
      ...Array.from(unitIndex.keys()),
    ]),
  );

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
        category: "Playwright",
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

  const pushLocalUnitOnly = (
    tab: string,
    localEntries: { testCaseId: string; specFile: string }[],
  ) => {
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

    const uniqueSheetTabs = Array.from(new Set(sheetTabsToRead));
    const rowsBySheetTab = await readTabsRowsBatch(sheets, uniqueSheetTabs);

    for (const tab of tabNames) {
      const localEntries = localIndex.get(tab) ?? [];
      const unitEntries = unitIndex.get(tab) ?? [];
      const localKeys = new Set(localEntries.map((e) => normalizeTcId(e.testCaseId)));
      const unitByKey = new Map(
        unitEntries.map((e) => [normalizeTcId(e.testCaseId), e] as const),
      );
      const resolved = resolvedBySuite.get(tab)!;

      if (!resolved.title) {
        pushLocalOnly(tab, localEntries);
        pushLocalUnitOnly(tab, unitEntries);
        continue;
      }

      const parsed = rowsBySheetTab.get(resolved.title);
      if (!parsed || !parsed.headers.length) {
        warnings.push(
          `Sheet tab "${resolved.title}" has no header row with Test Case ID.`,
        );
        pushLocalOnly(tab, localEntries);
        pushLocalUnitOnly(tab, unitEntries);
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
          const eng = categorizeEngine(fromSheet.category);
          const unitEntry = unitByKey.get(key);
          // Category=UI belongs to the Unit Test engine — only runnable when in unitSpecs.
          if (eng === "unit-test") {
            cases.push({
              ...fromSheet,
              tab,
              hasSpec: Boolean(unitEntry),
              implemented: Boolean(unitEntry),
              runnable: Boolean(unitEntry),
              specFile: unitEntry?.specFile ?? "",
            });
          } else {
            cases.push({
              ...fromSheet,
              tab,
              hasSpec: true,
              implemented: true,
              runnable: true,
              specFile: entry.specFile,
            });
          }
        } else {
          cases.push({
            id: `${tab}::${entry.testCaseId}`,
            tab,
            testCaseId: entry.testCaseId,
            testScenario: "",
            testCase: entry.testCaseId,
            category: "Playwright",
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

      // Include sheet Unit Test (Category=UI) rows — runnable when present in unitSpecs.
      const pushedKeys = new Set(
        cases.filter((c) => c.tab === tab).map((c) => normalizeTcId(c.testCaseId)),
      );
      for (const row of rows) {
        const tc = rowToTestCase(tab, row, headers);
        if (!tc) continue;
        if (categorizeEngine(tc.category) !== "unit-test") continue;
        const key = normalizeTcId(tc.testCaseId);
        if (pushedKeys.has(key)) continue;
        const unitEntry = unitByKey.get(key);
        cases.push({
          ...tc,
          tab,
          hasSpec: Boolean(unitEntry),
          implemented: Boolean(unitEntry),
          runnable: Boolean(unitEntry),
          specFile: unitEntry?.specFile ?? "",
        });
        pushedKeys.add(key);
      }

      // Local unitSpecs TCs not on the sheet (or sheet read missed them).
      for (const entry of unitEntries) {
        const key = normalizeTcId(entry.testCaseId);
        if (pushedKeys.has(key)) continue;
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
        pushedKeys.add(key);
      }
    }
  } catch (err) {
    const msg = (err as Error).message || String(err);
    for (const tab of tabNames) {
      warnings.push(`Sheet read failed for "${tab}": ${msg}`);
      pushLocalOnly(tab, localIndex.get(tab) ?? []);
      pushLocalUnitOnly(tab, unitIndex.get(tab) ?? []);
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
  const names = Array.from(
    new Set([
      ...getTabSuites().map((s) => s.tab),
      ...cases.map((c) => c.tab),
      ...Array.from(localIndex.keys()),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  return names.map((name) => {
    const suite = getTabSuite(name);
    const entries = localIndex.get(name) ?? [];
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

type ParsedResult = {
  tcId: string;
  status: string;
  error: string;
  title: string;
  /** Spec file from the Playwright JSON report, when available */
  file?: string;
};

function walkSuites(
  suite: { title?: string; file?: string; specs?: unknown[]; suites?: unknown[] },
  out: Map<string, ParsedResult>,
  inheritedFile = "",
) {
  const suiteFile = suite.file || inheritedFile;

  for (const spec of (suite.specs ?? []) as {
    title?: string;
    file?: string;
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
    // Final attempt wins (retries must not keep an earlier failure as the sheet status).
    const last = results[results.length - 1];
    let status = last?.status ?? "skipped";
    if (status === "timedOut" || status === "interrupted") status = "failed";

    let error = "";
    if (status === "failed") {
      for (const r of results) {
        for (const e of r.errors ?? []) {
          if (e.message) error = error ? `${error}\n---\n${e.message}` : e.message;
        }
      }
    }

    out.set(normalizeTcId(tcId), {
      tcId,
      title: spec.title ?? "",
      status,
      error: error.trim(),
      file: spec.file || suiteFile || undefined,
    });
  }

  for (const child of (suite.suites ?? []) as {
    title?: string;
    file?: string;
    specs?: unknown[];
    suites?: unknown[];
  }[]) {
    walkSuites(child, out, suiteFile);
  }
}

export function parsePlaywrightReport(reportPath: string): Map<string, ParsedResult> {
  const raw = readFileSync(reportPath, "utf8");
  const report = JSON.parse(raw) as {
    suites?: { title?: string; file?: string; specs?: unknown[]; suites?: unknown[] }[];
  };
  const byTc = new Map<string, ParsedResult>();
  for (const suite of report.suites ?? []) {
    walkSuites(suite, byTc);
  }
  return byTc;
}

/** Parse Jest `--json --outputFile` report into TC_XXX → result map. */
export function parseJestReport(reportPath: string): Map<string, ParsedResult> {
  const raw = readFileSync(reportPath, "utf8");
  const report = JSON.parse(raw) as {
    testResults?: {
      name?: string;
      assertionResults?: {
        title?: string;
        fullName?: string;
        status?: string;
        failureMessages?: string[];
      }[];
    }[];
  };
  const byTc = new Map<string, ParsedResult>();

  for (const fileResult of report.testResults ?? []) {
    const file = fileResult.name ?? "";
    for (const assertion of fileResult.assertionResults ?? []) {
      const title = assertion.title || assertion.fullName || "";
      const tcId =
        extractTcId(title) ||
        extractTcId(assertion.fullName ?? "") ||
        (() => {
          const m = `${assertion.fullName ?? ""} ${title}`.match(/(TC[-_]?\d+)/i);
          return m ? m[1] : null;
        })();
      if (!tcId) continue;

      let status = assertion.status ?? "failed";
      // Jest marks non-matching `--testNamePattern` cases as pending — do not sync those
      // as Failed (that made "Run failed" rewrite every other TC on the tab).
      if (status === "pending" || status === "todo" || status === "disabled" || status === "skipped") {
        continue;
      }

      const error =
        status === "failed"
          ? (assertion.failureMessages ?? []).filter(Boolean).join("\n---\n")
          : "";

      byTc.set(normalizeTcId(tcId), {
        tcId,
        title,
        status: status === "passed" ? "passed" : "failed",
        error: error.trim(),
        file: file || undefined,
      });
    }
  }

  return byTc;
}

function suiteFilesForEngine(tab: string, engine: SyncEngine): string[] {
  const suite = getTabSuite(tab);
  if (!suite) return [];
  if (engine === "unit-test") return suite.unitSpecs ?? [];
  return suite.specs ?? [];
}

function resultBelongsToTab(
  result: ParsedResult,
  tab: string,
  engine: SyncEngine = "playwright",
): boolean {
  const files = suiteFilesForEngine(tab, engine);
  if (!files.length) return true;
  if (!result.file) return true;

  // Reports often store file relative to testDir or as absolute paths.
  const file = result.file.replace(/\\/g, "/");
  const fileBase = file.split("/").pop() ?? file;
  return files.some((spec) => {
    const norm = spec.replace(/\\/g, "/").replace(/^\.\//, "");
    const specBase = norm.split("/").pop() ?? norm;
    return (
      file === norm ||
      file.endsWith(`/${norm}`) ||
      norm.endsWith(`/${file}`) ||
      file.includes(norm) ||
      fileBase === specBase
    );
  });
}

export async function syncTabResults(
  sheets: sheets_v4.Sheets,
  tab: string,
  resultsByTc: Map<string, ParsedResult>,
  engine: SyncEngine = "playwright",
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
  /** Final status values for cells we write this sync (`row:col` → status). */
  const statusWrites = new Map<string, string>();
  let updated = 0;
  const spreadsheetId = getSpreadsheetId();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const sheetRow = headerRowNumber + 1 + i;
    const tcRaw = row[idx.tc];
    if (!tcRaw) continue;

    const category = idx.category >= 0 ? String(row[idx.category] ?? "").trim() : "";
    const eng = categorizeEngine(category);
    if (eng === "api") continue;
    if (engine === "playwright" && (eng === "unit-test")) continue;
    if (engine === "unit-test" && eng !== "unit-test") continue;

    const result = resultsByTc.get(normalizeTcId(tcRaw));
    if (!result) continue;
    if (!resultBelongsToTab(result, tab, engine)) continue;

    const status = result.status === "passed" ? "Passed" : "Failed";
    const comment =
      result.status === "passed" ? "" : formatErrorForSheet(result.error, result.title);

    const statusCol = engine === "playwright" ? idx.playwright : idx.uiStatus;
    const writes = [{ col: statusCol, value: status }];
    if (idx.comment >= 0) writes.push({ col: idx.comment, value: comment });

    statusWrites.set(`${sheetRow}:${statusCol}`, status);

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

  // Professional badge formatting for both status columns across the tab.
  try {
    const sheetId = await getSheetIdByTitle(sheets, sheetTab);
    if (sheetId != null) {
      const formatCells: { row: number; col: number; status: string }[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const sheetRow = headerRowNumber + 1 + i;
        if (!String(row[idx.tc] ?? "").trim()) continue;

        for (const col of [idx.uiStatus, idx.playwright]) {
          if (col < 0) continue;
          const written = statusWrites.get(`${sheetRow}:${col}`);
          const value = (written ?? String(row[col] ?? "")).trim();
          if (!value || !statusStyle(value)) continue;
          formatCells.push({ row: sheetRow, col, status: value });
        }
      }
      await applyStatusCellFormats(sheets, spreadsheetId, sheetId, formatCells);
    }
  } catch {
    // Value sync already succeeded; formatting is best-effort.
  }

  return updated;
}

export async function syncSheetsForTabs(
  tabs: string[],
  reportPath?: string,
  engine: SyncEngine = "playwright",
): Promise<string[]> {
  if (process.env.E2E_NO_SHEET_SYNC === "1") {
    return ["Sheet sync skipped (E2E_NO_SHEET_SYNC=1)."];
  }

  const defaultReport =
    engine === "unit-test" ? getUnitResultsFile() : getResultsFile();
  const resolvedReport = resolve(reportPath ?? defaultReport);
  if (!existsSync(resolvedReport)) {
    return [`Sheet sync skipped: report not found at ${resolvedReport}`];
  }

  const resultsByTc =
    engine === "unit-test"
      ? parseJestReport(resolvedReport)
      : parsePlaywrightReport(resolvedReport);
  if (!resultsByTc.size) {
    return ["Sheet sync skipped: no TC tests in report."];
  }

  const sheets = createSheetsClient();
  const summary: string[] = [];

  for (const tab of tabs) {
    try {
      const n = await syncTabResults(sheets, tab, resultsByTc, engine);
      if (n === 0) {
        const forTab = Array.from(resultsByTc.values()).filter((r) =>
          resultBelongsToTab(r, tab, engine),
        ).length;
        summary.push(
          `${tab}: 0 row(s) updated (${resultsByTc.size} TC(s) in report, ${forTab} matched this tab's specs)`,
        );
      } else {
        summary.push(`${tab}: ${n} row(s) updated`);
      }
    } catch (err) {
      summary.push(`${tab}: sync failed — ${(err as Error).message}`);
    }
  }

  clearSheetCaches();
  return summary;
}
