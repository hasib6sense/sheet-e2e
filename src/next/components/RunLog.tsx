"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  classifyLogLine,
  LOG_LINE_CLASS,
  stripAnsi,
  testLineIndex,
  type LogLineKind,
} from "../../strip-ansi";
import { cn } from "../cn";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={cn("sheet-e2e-spinner", className)}
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function LineIcon({ kind }: { kind: LogLineKind }) {
  if (kind === "running") return <Spinner />;
  if (kind === "pass" || kind === "summary-pass") {
    return (
      <span className="sheet-e2e-run-log__icon sheet-e2e-log-pass" aria-hidden>
        ✓
      </span>
    );
  }
  if (kind === "fail" || kind === "summary-fail") {
    return (
      <span className="sheet-e2e-run-log__icon sheet-e2e-log-fail" aria-hidden>
        ✘
      </span>
    );
  }
  return <span className="sheet-e2e-run-log__icon" aria-hidden />;
}

/** Drop reporter status marks — icon column owns pass/fail/running. */
function displayLine(line: string, kind: LogLineKind): string {
  if (kind === "pass" || kind === "fail" || kind === "running") {
    return line.replace(/^\s*[…⋯○oO✓✔✘✕x-]\s*/i, "");
  }
  return line;
}

type DisplayRow = { key: string; line: string; kind: LogLineKind };

/** Collapse begin+end for the same test index into one updating row. */
function buildDisplayRows(text: string): DisplayRow[] {
  const lines = stripAnsi(text).split("\n");
  const rows: DisplayRow[] = [];
  const indexPos = new Map<string, number>();

  for (const line of lines) {
    const kind = classifyLogLine(line);
    const idx = testLineIndex(line);

    if (idx && (kind === "running" || kind === "pass" || kind === "fail")) {
      const key = `t-${idx}`;
      const existing = indexPos.get(key);
      if (existing != null) {
        rows[existing] = { key, line, kind };
      } else {
        indexPos.set(key, rows.length);
        rows.push({ key, line, kind });
      }
      continue;
    }

    rows.push({ key: `l-${rows.length}-${line.slice(0, 16)}`, line, kind });
  }

  return rows;
}

type RunLogProps = {
  text: string;
  expanded?: boolean;
  running?: boolean;
};

export function RunLog({ text, expanded = false, running = false }: RunLogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => buildDisplayRows(text), [text]);
  const hasLiveRunning = rows.some((r) => r.kind === "running");
  const runFinishedInLog = /Exit code:/i.test(text) || /--- Syncing/i.test(text);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, running]);

  return (
    <div
      ref={ref}
      className={cn(
        "sheet-e2e-run-log",
        expanded ? "sheet-e2e-run-log--expanded" : "sheet-e2e-run-log--collapsed",
      )}
    >
      {rows.map((row) => {
        const showIcon =
          row.kind === "running" ||
          row.kind === "pass" ||
          row.kind === "fail" ||
          row.kind === "summary-pass" ||
          row.kind === "summary-fail";
        const textOut = displayLine(row.line, row.kind);

        return (
          <div key={row.key} className="sheet-e2e-run-log__row">
            {showIcon ? <LineIcon kind={row.kind} /> : <span className="sheet-e2e-run-log__icon" />}
            <span className={cn("sheet-e2e-run-log__text", LOG_LINE_CLASS[row.kind])}>
              {textOut || "\u00a0"}
            </span>
          </div>
        );
      })}

      {running && !hasLiveRunning && !runFinishedInLog && (
        <div className="sheet-e2e-run-log__row sheet-e2e-log-running" style={{ marginTop: 4 }}>
          <Spinner />
          <span>Waiting for tests…</span>
        </div>
      )}
    </div>
  );
}
