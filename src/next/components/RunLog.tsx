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
      className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-sky-400", className)}
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

function LineIcon({ kind }: { kind: LogLineKind }) {
  if (kind === "running") return <Spinner />;
  if (kind === "pass" || kind === "summary-pass") {
    return <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>✓</span>;
  }
  if (kind === "fail" || kind === "summary-fail") {
    return <span className="mt-0.5 shrink-0 text-red-400" aria-hidden>✘</span>;
  }
  return <span className="w-3.5 shrink-0" aria-hidden />;
}

/** Drop reporter status marks — icon column owns pass/fail/running. */
function displayLine(line: string, kind: LogLineKind): string {
  if (kind === "pass" || kind === "fail" || kind === "running") {
    return line.replace(/^\s*[…⋯✓✔✘✕x-]\s*/i, "");
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

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, running]);

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-auto rounded-md bg-neutral-950/50 p-3 font-mono text-xs leading-relaxed",
        expanded ? "max-h-72" : "max-h-36",
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
          <div key={row.key} className="flex gap-2">
            {showIcon ? <LineIcon kind={row.kind} /> : <span className="w-3.5 shrink-0" />}
            <span
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap break-words",
                LOG_LINE_CLASS[row.kind],
              )}
            >
              {textOut || "\u00a0"}
            </span>
          </div>
        );
      })}

      {running && !hasLiveRunning && (
        <div className="mt-1 flex gap-2 text-sky-300">
          <Spinner />
          <span>Waiting for tests…</span>
        </div>
      )}
    </div>
  );
}
