/** Remove ANSI escape sequences from terminal output. */
export { stripAnsi } from "./format-error";

export type LogLineKind =
  | "running"
  | "pass"
  | "fail"
  | "summary-pass"
  | "summary-fail"
  | "cmd"
  | "section"
  | "muted"
  | "default";

export function classifyLogLine(line: string): LogLineKind {
  const t = line.trim();
  if (!t) return "muted";
  if (/^> npx/.test(t)) return "cmd";
  if (/^---/.test(t)) return "section";
  if (/Exit code:\s*0/.test(t)) return "summary-pass";
  if (/Exit code:/.test(t)) return "summary-fail";
  // Running marker from stream-list reporter (ellipsis)
  if (/^[…⋯○oO]/.test(t) || /^\.\.\.\s+\d+/.test(t)) return "running";
  if (/^[✓✔]/.test(t) || /\bok\s+\d+/i.test(t)) return "pass";
  if (/^[✘✕]/.test(t) || /^\s*x\s+\d/i.test(line)) return "fail";
  if (/✓/.test(line) || /\bok\s+\d+/i.test(t)) return "pass";
  if (/✘/.test(line) || /^\s*x\s+\d/i.test(line)) return "fail";
  if (/\d+\s+passed/i.test(t) && !/failed/i.test(t)) return "summary-pass";
  if (/\d+\s+failed/i.test(t)) return "summary-fail";
  if (/Running \d+ tests/i.test(t)) return "muted";
  return "default";
}

export const LOG_LINE_CLASS: Record<LogLineKind, string> = {
  running: "sheet-e2e-log-running",
  pass: "sheet-e2e-log-pass",
  fail: "sheet-e2e-log-fail",
  "summary-pass": "sheet-e2e-log-summary-pass",
  "summary-fail": "sheet-e2e-log-summary-fail",
  cmd: "sheet-e2e-log-cmd",
  section: "sheet-e2e-log-section",
  muted: "sheet-e2e-log-muted",
  default: "sheet-e2e-log-default",
};

/** Extract Playwright list/stream test index from a line, if present. */
export function testLineIndex(line: string): string | null {
  const m = line.match(/^\s*(?:[…⋯○oO✓✔✘✕x-]|ok)\s+(\d+)\b/i);
  return m?.[1] ?? null;
}
