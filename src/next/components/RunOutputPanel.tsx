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
  const passedFromLines = (clean.match(/^\s*[✓✔ok]\s+\d+/gim) ?? []).length;
  const failedFromLines = (clean.match(/^\s*[x✘✕]\s+\d+/gim) ?? []).length;

  return {
    passed: passedMatches.length ? sumMatches(passedMatches) : passedFromLines,
    failed: failedMatches.length ? sumMatches(failedMatches) : failedFromLines,
  };
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
    <section
      ref={panelRef}
      className="mb-3 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-sm"
      aria-live="polite"
      aria-busy={running}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {running && <span className="animate-pulse text-sky-400">●</span>}
          {success && <span className="text-emerald-400">✓</span>}
          {failed && <span className="text-red-400">✘</span>}
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {running ? "Running…" : success ? "Completed" : failed ? "Failed" : "Output"}
            </p>
            {runLabel && (
              <p className="truncate text-xs text-neutral-400">{stripAnsi(runLabel).trim()}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(stats.passed > 0 || stats.failed > 0) && (
            <div className="flex gap-1.5 text-xs">
              {stats.passed > 0 && (
                <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-emerald-400">
                  {stats.passed} passed
                </span>
              )}
              {stats.failed > 0 && !(finished && exitCode === 0) && (
                <span className="rounded bg-red-950 px-1.5 py-0.5 text-red-400">
                  {stats.failed} failed
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          {finished && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
              aria-label="Dismiss run output"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="p-2">
        <RunLog text={runLog} expanded={expanded} running={running} />
      </div>
    </section>
  );
}
