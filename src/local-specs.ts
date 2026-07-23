import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTabSuites } from "./config";

export function normalizeTcId(id: string) {
  return id.trim().replace(/[-_\s]/g, "").toLowerCase();
}

/** TC ids declared in a spec via test("TC_001: ...") or test("TC-001: ...") */
export function extractTcIdsFromSpecContent(content: string): string[] {
  const ids: string[] = [];
  const re = /test\s*\(\s*[`"'](TC[-_]?\d+)/gi;
  let match = re.exec(content);
  while (match) {
    ids.push(match[1]);
    match = re.exec(content);
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

/** Every TC found in mapped spec files, keyed by tab. */
export function indexLocalPlaywrightTests(): Map<string, LocalSpecEntry[]> {
  const byTab = new Map<string, LocalSpecEntry[]>();

  for (const suite of getTabSuites()) {
    const entries: LocalSpecEntry[] = [];
    const seen = new Set<string>();

    for (const specFile of suite.specs) {
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

export function tabsWithLocalTests(): string[] {
  return [...indexLocalPlaywrightTests().keys()];
}

export function isTcInLocalSpecs(tab: string, testCaseId: string): boolean {
  const entries = indexLocalPlaywrightTests().get(tab);
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
