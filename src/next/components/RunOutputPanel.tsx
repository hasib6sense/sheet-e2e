"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripAnsi } from "../../strip-ansi";
import { RunLog } from "./RunLog.tsx";

export type RunOutputState = {
  running: boolean;
  runLog: string;
  runLabel?: string;
  exitCode?: number | null;
};

type RunOutputPanelProps = RunOutputState & {
  onDismiss?: () => void;
};

function sumMatches(matches: RegExpMatchArray[]) {
  return matches.reduce((sum, m) => sum + Number(m[1]), 0);
}

function isPassMark(mark: string) {
  const m = mark.toLowerCase();
  return m === "✓" || m === "✔" || m === "ok";
}

/** Stable id for a Playwright list line so retries of the same test collapse. */
function playwrightResultKey(line: string): string {
  return line
    .replace(/^(?:[✓✔✘✕x-]|ok)\s+\d+\b\s*/i, "")
    .replace(/\s*\(retry #\d+\)/i, "")
    .replace(/\s*\([^)]*s\)\s*$/i, "")
    .trim();
}

/** Sum every Jest `Tests:` summary across multi-module runs (not only the last). */
function parseJestTestsSummary(clean: string): { passed: number; failed: number } | null {
  const matches = [...clean.matchAll(/^\s*Tests:\s+(.+)$/gim)];
  if (!matches.length) return null;
  let passed = 0;
  let failed = 0;
  for (const m of matches) {
    const body = m[1]!;
    passed += Number(body.match(/(\d+)\s+passed/)?.[1] ?? 0);
    failed += Number(body.match(/(\d+)\s+failed/)?.[1] ?? 0);
  }
  if (passed === 0 && failed === 0) return null;
  return { passed, failed };
}

/**
 * Aggregate pass/fail counts from a multi-module run log.
 * - Prefer Jest `Tests:` summaries when present (unit-test engine); sum across modules.
 * - Never key only by list index (Playwright renumbers each invocation).
 * - Skip `[setup]` (auth.setup).
 * - Collapse retries: same test may log twice when `retries: 1`; keep last status.
 */
function parseRunStats(log: string) {
  const clean = stripAnsi(log);

  const jestSummary = parseJestTestsSummary(clean);
  if (jestSummary) return jestSummary;

  const byKey = new Map<string, "pass" | "fail">();
  let anonPassed = 0;
  let anonFailed = 0;
  let anonSeq = 0;

  for (const raw of clean.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/\[setup\]/i.test(line)) continue;
    if (/^[…⋯○]\s+\d+\b/.test(line) || /^\.\.\.\s+\d+\b/.test(line)) continue;
    // Suite file headers — not individual tests
    if (/^(PASS|FAIL)\s+\S/.test(line)) continue;
    if (/^Test Suites:/i.test(line)) continue;

    const list = line.match(/^(?:([✓✔✘✕x-])|ok)\s+\d+\b/i);
    if (list) {
      const mark = list[1] ?? "ok";
      if (mark === "-") continue;
      const status: "pass" | "fail" = isPassMark(mark) ? "pass" : "fail";
      const key = playwrightResultKey(line) || `__anon_${anonSeq++}`;
      byKey.set(key, status);
      continue;
    }

    // Jest per-test lines: "✓ TC_001: …" (space after mark — `\b` does not match)
    if (/^[✓✔](\s|$)/.test(line)) {
      anonPassed += 1;
      continue;
    }
    if (/^[✘✕](\s|$)/.test(line)) {
      anonFailed += 1;
    }
  }

  let passed = anonPassed;
  let failed = anonFailed;
  for (const status of byKey.values()) {
    if (status === "pass") passed += 1;
    else failed += 1;
  }

  if (passed > 0 || failed > 0) {
    return { passed, failed };
  }

  const passedMatches = [...clean.matchAll(/^\s*(\d+)\s+passed\b/gim)];
  const failedMatches = [...clean.matchAll(/^\s*(\d+)\s+failed\b/gim)];
  return {
    passed: sumMatches(passedMatches),
    failed: sumMatches(failedMatches),
  };
}

export function RunOutputPanel({
  running,
  runLog,
  runLabel,
  exitCode: _exitCode,
  onDismiss,
}: RunOutputPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => parseRunStats(runLog), [runLog]);

  const visible = running || Boolean(runLog.trim());
  const finished = !running && runLog.trim().length > 0;

  useEffect(() => {
    if (running) setExpanded(false);
  }, [running]);

  useEffect(() => {
    if (running && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [running]);

  if (!visible) return null;

  return (
    <section ref={panelRef} className="sheet-e2e-run-panel" aria-live="polite" aria-busy={running}>
      <div className="sheet-e2e-run-panel__header">
        <div style={{ display: "flex", minWidth: 0, flex: 1, alignItems: "center", gap: 8 }}>
          {running && <span className="sheet-e2e-run-panel__dot">●</span>}
          {finished && <span className="sheet-e2e-run-panel__ok">✓</span>}
          <div style={{ minWidth: 0 }}>
            <p className="sheet-e2e-run-panel__title">
              {running ? "Running…" : finished ? "Completed" : "Output"}
            </p>
            {runLabel && (
              <p className="sheet-e2e-run-panel__subtitle">{stripAnsi(runLabel).trim()}</p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(stats.passed > 0 || stats.failed > 0) && (
            <div style={{ display: "flex", gap: 6 }}>
              {stats.passed > 0 && (
                <span className="sheet-e2e-run-panel__badge-pass">{stats.passed} passed</span>
              )}
              {stats.failed > 0 && (
                <span className="sheet-e2e-run-panel__badge-fail">{stats.failed} failed</span>
              )}
            </div>
          )}
          <button type="button" onClick={() => setExpanded((v) => !v)} className="sheet-e2e-run-panel__btn">
            {expanded ? "Collapse" : "Expand"}
          </button>
          {finished && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="sheet-e2e-run-panel__btn"
              aria-label="Dismiss run output"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 8 }}>
        <RunLog text={runLog} expanded={expanded} running={running} />
      </div>
    </section>
  );
}
