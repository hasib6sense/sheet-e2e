"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripAnsi } from "../../strip-ansi";
import { RunLog } from "./RunLog";

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

function parseRunStats(log: string) {
  const clean = stripAnsi(log);
  const passedMatches = [...clean.matchAll(/^\s*(\d+)\s+passed\b/gim)];
  const failedMatches = [...clean.matchAll(/^\s*(\d+)\s+failed\b/gim)];
  if (passedMatches.length || failedMatches.length) {
    return {
      passed: sumMatches(passedMatches),
      failed: sumMatches(failedMatches),
    };
  }

  const byIndex = new Map<string, "pass" | "fail">();
  for (const line of clean.split("\n")) {
    const m = line.match(/^\s*([✓✔✘✕x-]|ok)\s+(\d+)\b/i);
    if (!m) continue;
    const mark = m[1];
    const idx = m[2];
    if (mark === "-") continue;
    if (/[✓✔]/u.test(mark) || mark.toLowerCase() === "ok") byIndex.set(idx, "pass");
    else byIndex.set(idx, "fail");
  }

  let passed = 0;
  let failed = 0;
  for (const status of byIndex.values()) {
    if (status === "pass") passed += 1;
    else failed += 1;
  }
  return { passed, failed };
}

export function RunOutputPanel({
  running,
  runLog,
  runLabel,
  exitCode,
  onDismiss,
}: RunOutputPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => parseRunStats(runLog), [runLog]);

  const visible = running || Boolean(runLog.trim());
  const finished = !running && runLog.trim().length > 0;
  const success = finished && exitCode === 0;
  const failed = finished && exitCode != null && exitCode !== 0;

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
          {success && <span className="sheet-e2e-run-panel__ok">✓</span>}
          {failed && <span className="sheet-e2e-run-panel__err">✘</span>}
          <div style={{ minWidth: 0 }}>
            <p className="sheet-e2e-run-panel__title">
              {running ? "Running…" : success ? "Completed" : failed ? "Failed" : "Output"}
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
              {stats.failed > 0 && !(finished && exitCode === 0) && (
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
