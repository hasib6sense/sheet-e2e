export type {
  E2eTestCase,
  E2eTabInfo,
  E2eRunRequest,
  E2eRunResult,
  E2eTabSuite,
  SheetE2eConfigFile,
} from "./types";

export {
  loadConfig,
  clearConfigCache,
  getSpreadsheetId,
  getCredentialsPath,
  getResultsFile,
  getSkipTabs,
  getTabSuites,
  getTabSuite,
  tabsWithSpecs,
} from "./config";

export {
  normalizeTcId,
  extractTcIdsFromSpecContent,
  extractTcIdsFromSpecFile,
  indexLocalPlaywrightTests,
  tabsWithLocalTests,
  isTcInLocalSpecs,
  localSpecFileForTc,
} from "./local-specs";
export type { LocalSpecEntry } from "./local-specs";

export { formatErrorForSheet, stripAnsi } from "./format-error";
export { classifyLogLine, LOG_LINE_CLASS } from "./strip-ansi";
export type { LogLineKind } from "./strip-ansi";

export {
  createSheetsClient,
  listSheetTabNames,
  fetchImplementedTestCases,
  fetchAllTestCases,
  fetchTabInfo,
  parsePlaywrightReport,
  syncTabResults,
  syncSheetsForTabs,
} from "./google-sheets";

export { runE2eTests, listMappedTabs } from "./runner";
export type { E2eRunCallbacks } from "./runner";
