export type E2eTestCase = {
  /** `${tab}::${testCaseId}` */
  id: string;
  tab: string;
  testCaseId: string;
  testScenario: string;
  testCase: string;
  category: string;
  uiStatus: string;
  playwright: string;
  comment: string;
  /** Mapped tab has a Playwright spec file */
  hasSpec: boolean;
  /** TC exists in a local spec file (shown in runner) */
  implemented: boolean;
  specFile: string;
  runnable: boolean;
};

export type E2eTabInfo = {
  name: string;
  hasSpec: boolean;
  specFiles: string[];
  caseCount: number;
  /** TCs with a matching test() in local spec files */
  implementedCount: number;
  runnableCount: number;
};

export type E2eRunRequest =
  | { mode: "tabs"; tabs: string[]; syncSheet?: boolean }
  | { mode: "cases"; cases: { tab: string; testCaseId: string }[]; syncSheet?: boolean };

export type E2eRunResult = {
  exitCode: number;
  output: string;
  syncedTabs: string[];
  syncSummary: string[];
};

export type E2eTabSuite = {
  tab: string;
  specs: string[];
  project?: string;
  workers?: number;
};

export type SheetE2eConfigFile = {
  spreadsheetId?: string;
  credentialsPath?: string;
  resultsFile?: string;
  skipTabs?: string[];
  tabSuitesPath?: string;
  tabSuites?: E2eTabSuite[];
};
