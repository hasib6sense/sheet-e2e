import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTabSuites } from "./config";

export function normalizeTcId(id: string) {
  return id.trim().replace(/[-_\s]/g, "").toLowerCase();
}

/** TC ids declared via test("TC_001: ..."), it("TC_001: ..."), or hyphen style.
 *  Commented-out tests are ignored so fully-disabled specs do not appear as implemented. */
export function extractTcIdsFromSpecContent(content: string): string[] {
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const ids: string[] = [];
  const re = /(?:test|it)\s*\(\s*[`"'](TC[-_]?\d+)/gi;
  let match = re.exec(withoutComments);
  while (match) {
    ids.push(match[1]);
    match = re.exec(withoutComments);
  }
  return ids;
}

export function extractTcIdsFromSpecFile(specPath: string): string[] {
  const full = resolve(process.cwd(), specPath);
  if (!existsSync(full)) return [];
  return extractTcIdsFromSpecContent(readFileSync(full, "utf8"));
}

export type LocalSpecEntry = {
  tab: string;
  testCaseId: string;
  specFile: string;
};

function indexFromSuiteFiles(
  filesKey: "specs" | "unitSpecs",
): Map<string, LocalSpecEntry[]> {
  const byTab = new Map<string, LocalSpecEntry[]>();

  for (const suite of getTabSuites()) {
    const files = filesKey === "specs" ? suite.specs : (suite.unitSpecs ?? []);
    if (!files.length) continue;

    const entries: LocalSpecEntry[] = [];
    const seen = new Set<string>();

    for (const specFile of files) {
      for (const testCaseId of extractTcIdsFromSpecFile(specFile)) {
        const key = normalizeTcId(testCaseId);
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ tab: suite.tab, testCaseId, specFile });
      }
    }

    if (entries.length) {
      byTab.set(suite.tab, entries);
    }
  }

  return byTab;
}

/** Every TC found in mapped Playwright spec files, keyed by tab. */
export function indexLocalPlaywrightTests(): Map<string, LocalSpecEntry[]> {
  return indexFromSuiteFiles("specs");
}

/** Every TC found in mapped unitSpecs (Jest) files, keyed by tab. */
export function indexLocalUnitTests(): Map<string, LocalSpecEntry[]> {
  return indexFromSuiteFiles("unitSpecs");
}

export function tabsWithLocalTests(): string[] {
  return [...indexLocalPlaywrightTests().keys()];
}

export function isTcInLocalSpecs(tab: string, testCaseId: string): boolean {
  const entries = indexLocalPlaywrightTests().get(tab);
  if (!entries) return false;
  const key = normalizeTcId(testCaseId);
  return entries.some((e) => normalizeTcId(e.testCaseId) === key);
}

export function isTcInLocalUnitTests(tab: string, testCaseId: string): boolean {
  const entries = indexLocalUnitTests().get(tab);
  if (!entries) return false;
  const key = normalizeTcId(testCaseId);
  return entries.some((e) => normalizeTcId(e.testCaseId) === key);
}

export function localSpecFileForTc(tab: string, testCaseId: string): string | undefined {
  const entries = indexLocalPlaywrightTests().get(tab);
  if (!entries) return undefined;
  const key = normalizeTcId(testCaseId);
  return entries.find((e) => normalizeTcId(e.testCaseId) === key)?.specFile;
}

export function localUnitSpecFileForTc(tab: string, testCaseId: string): string | undefined {
  const entries = indexLocalUnitTests().get(tab);
  if (!entries) return undefined;
  const key = normalizeTcId(testCaseId);
  return entries.find((e) => normalizeTcId(e.testCaseId) === key)?.specFile;
}
