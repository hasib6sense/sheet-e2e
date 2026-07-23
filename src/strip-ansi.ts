/** Remove ANSI escape sequences from terminal output. */
export { stripAnsi } from "./format-error";

export type LogLineKind =
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
  if (/✓/.test(line) || /\bok\s+\d+/i.test(t)) return "pass";
  if (/✘/.test(line) || /^\s*x\s+\d/i.test(line)) return "fail";
  if (/\d+\s+passed/i.test(t) && !/failed/i.test(t)) return "summary-pass";
  if (/\d+\s+failed/i.test(t)) return "summary-fail";
  if (/Running \d+ tests/i.test(t)) return "muted";
  return "default";
}

export const LOG_LINE_CLASS: Record<LogLineKind, string> = {
  pass: "text-emerald-400",
  fail: "text-red-400",
  "summary-pass": "text-emerald-300 font-semibold",
  "summary-fail": "text-red-300 font-semibold",
  cmd: "text-sky-300",
  section: "text-amber-300 font-medium",
  muted: "text-neutral-500",
  default: "text-neutral-200",
};
