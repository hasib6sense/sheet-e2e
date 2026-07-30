/** Remove ANSI escape sequences from terminal output. */
export { stripAnsi } from "./format-error";

export type LogLineKind =
  | "running"
  | "pass"
  | "fail"
  | "skip"
  | "suite-pass"
  | "suite-fail"
  | "group"
  | "summary-pass"
  | "summary-fail"
  | "cmd"
  | "section"
  | "muted"
  | "default";

/** Jest-indented console output and object dumps — not describe() group headers. */
export function isConsoleOrDumpLine(line: string): boolean {
  const t = line.trim();
  if (/^console\.(log|warn|error|info|debug)\b/.test(t)) return true;
  if (/^[A-Za-z_$][\w$]*:\s/.test(t)) return true;
  if (/^[\[\{]/.test(t) || /^[\]\}],?$/.test(t)) return true;
  if (/^['"`]/.test(t)) return true;
  if (/^-?\d[\d.eE+-]*,?$/.test(t)) return true;
  if (/^(true|false|null|undefined),?$/i.test(t)) return true;
  if (/\[(Array|Object|Function|Date|RegExp|Symbol)\]/i.test(t)) return true;
  return false;
}

export function isJestSummaryLine(line: string): boolean {
  const t = line.trim();
  return /^Test Suites:/i.test(t) || /^Tests:/i.test(t) || /^Snapshots:/i.test(t);
}

/** Jest summary footer — red icon when any non-zero failed count is present. */
export function classifyJestSummaryLine(line: string): "summary-pass" | "summary-fail" {
  const t = line.trim();
  const failed = t.match(/\b(\d+)\s+failed\b/i);
  if (failed && parseInt(failed[1]!, 10) > 0) return "summary-fail";
  return "summary-pass";
}

export type JestSummarySegment = { text: string; tone: "default" | "pass" | "fail" };

/** Split Jest summary lines so failed/passed counts can be colored like the terminal. */
export function parseJestSummarySegments(line: string): JestSummarySegment[] | null {
  const t = line.trim();
  if (!isJestSummaryLine(t)) return null;

  const segments: JestSummarySegment[] = [];
  const re = /(\d+\s+(?:failed|passed|total|skipped))/gi;
  let last = 0;

  for (const match of t.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > last) segments.push({ text: t.slice(last, idx), tone: "default" });
    const token = match[1]!;
    const count = parseInt(token, 10);
    let tone: JestSummarySegment["tone"] = "default";
    if (/failed/i.test(token)) tone = count > 0 ? "fail" : "default";
    else if (/passed/i.test(token)) tone = count > 0 ? "pass" : "default";
    segments.push({ text: token, tone });
    last = idx + token.length;
  }

  if (last < t.length) segments.push({ text: t.slice(last), tone: "default" });
  return segments.length ? segments : [{ text: t, tone: "default" }];
}

export function classifyLogLine(line: string): LogLineKind {
  const t = line.trim();
  if (!t) return "muted";
  if (/^> npx/.test(t)) return "cmd";
  if (/^---/.test(t)) return "section";
  if (/^Running\b/i.test(t) || /^Re-running\b/i.test(t) || /^Finished\b/i.test(t)) return "muted";
  if (/Exit code:\s*0/.test(t)) return "summary-pass";
  if (/Exit code:/.test(t)) return "summary-fail";
  if (/^[○◌]\s+skipped\b/i.test(t) || /^[-–]\s+skipped\b/i.test(t)) return "skip";
  if (/^[…⋯○]\s+\d+\b/.test(t) || /^\.\.\.\s+\d+\b/.test(t)) return "running";
  if (/^PASS\s+\S/.test(t)) return "suite-pass";
  if (/^FAIL\s+\S/.test(t)) return "suite-fail";
  if (/^[✓✔](\s|$)/.test(t) || /^ok\s+\d+\b/i.test(t)) return "pass";
  if (/^[✘✕](\s|$)/.test(t) || /^\s*x\s+\d+\b/i.test(line)) return "fail";
  if (/✓/.test(line) && !/\|/.test(line)) return "pass";
  if (/[✘✕]/.test(line) && !/\|/.test(line)) return "fail";
  if (isJestSummaryLine(t)) return classifyJestSummaryLine(t);
  if (/^Time:/i.test(t) || /^Ran all test suites/i.test(t) || /^Test results written to/i.test(t)) return "muted";
  if (/\d+\s+passed\b/i.test(t) && !/\bfailed\b/i.test(t)) return "summary-pass";
  if (/^\d+\s+failed\b/i.test(t)) return "summary-fail";
  if (/Running \d+ tests/i.test(t)) return "muted";
  // Keep Jest failure detail blocks as normal text so the UI doesn't
  // render them with the uppercase group-label styling.
  if (
    /^\s*●\s+/.test(line) ||
    /^\s*expect\(/.test(line) ||
    /^\s*Expected\b/.test(line) ||
    /^\s*Received\b/.test(line) ||
    /^\s*at\s+/.test(line) ||
    /^\s*</.test(line)
  ) {
    return "default";
  }
  // Jest describe() group headers (indented, no result mark).
  // Skip console.log dumps — they are indented too but must not get uppercase group styling.
  if (
    /^\s{2,}\S/.test(line) &&
    !/^[✓✔✘✕○◌]/.test(t) &&
    !/\|/.test(t) &&
    !isConsoleOrDumpLine(line)
  ) {
    return "group";
  }
  // Coverage / table dumps from Jest
  if (
    /^\|/.test(t) ||
    /\|\s*[\d.]+\s*\|/.test(t) ||
    /^File\s+\|/.test(t) ||
    /^All files\b/.test(t) ||
    /^-{3,}/.test(t) ||
    /^\s*%\s*Stmts\b/.test(t)
  ) {
    return "muted";
  }
  return "default";
}

export const LOG_LINE_CLASS: Record<LogLineKind, string> = {
  running: "sheet-e2e-log-running",
  pass: "sheet-e2e-log-pass",
  fail: "sheet-e2e-log-fail",
  skip: "sheet-e2e-log-skip",
  "suite-pass": "sheet-e2e-log-suite-pass",
  "suite-fail": "sheet-e2e-log-suite-fail",
  group: "sheet-e2e-log-group",
  "summary-pass": "sheet-e2e-log-summary-pass",
  "summary-fail": "sheet-e2e-log-summary-fail",
  cmd: "sheet-e2e-log-cmd",
  section: "sheet-e2e-log-section",
  muted: "sheet-e2e-log-muted",
  default: "sheet-e2e-log-default",
};

/** Parse Jest/Playwright test line into title + optional duration. */
export function parseTestLine(line: string): { title: string; duration?: string } {
  const stripped = line
    .replace(/^\s*[…⋯○✓✔✘✕x-]\s*/i, "")
    .replace(/^skipped\s+/i, "")
    .trim();
  const m = stripped.match(/^(TC[-_]?\d+:\s*.+?)(?:\s*\((\d+\s*ms)\))?$/i);
  if (m) return { title: m[1]!.trim(), duration: m[2]?.trim() };
  return { title: stripped };
}

/** Basename for Jest `PASS path/to/file.tsx` lines. */
export function formatSuiteLine(line: string): string {
  const t = line.trim().replace(/^(PASS|FAIL)\s+/, "");
  const parts = t.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? t;
}

/** Extract Playwright list/stream test index from a line, if present. */
export function testLineIndex(line: string): string | null {
  const m = line.match(/^\s*(?:[…⋯○✓✔✘✕x-]|ok)\s+(\d+)\b/i);
  return m?.[1] ?? null;
}
