"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  classifyLogLine,
  formatSuiteLine,
  LOG_LINE_CLASS,
  parseTestLine,
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
  if (kind === "pass" || kind === "summary-pass" || kind === "suite-pass") {
    return (
      <span className="sheet-e2e-run-log__icon sheet-e2e-log-pass" aria-hidden>
        ✓
      </span>
    );
  }
  if (kind === "fail" || kind === "summary-fail" || kind === "suite-fail") {
    return (
      <span className="sheet-e2e-run-log__icon sheet-e2e-log-fail" aria-hidden>
        ✘
      </span>
    );
  }
  if (kind === "skip") {
    return (
      <span className="sheet-e2e-run-log__icon sheet-e2e-log-skip" aria-hidden>
        ○
      </span>
    );
  }
  return <span className="sheet-e2e-run-log__icon" aria-hidden />;
}

type DisplayRow = {
  key: string;
  line: string;
  kind: LogLineKind;
  title?: string;
  duration?: string;
};

function isCoverageNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^File\s+\|/.test(t) || /^All files\b/.test(t)) return true;
  if (/^\|/.test(t) || /\|\s*[\d.]+\s*\|/.test(t)) return true;
  if (/^-{5,}/.test(t)) return true;
  if (/^\s*%\s*Stmts\b/.test(t)) return true;
  if (/^\s+\S+\s+\|/.test(line)) return true;
  return false;
}

/** Collapse begin+end for the same test index within one Playwright/Jest invocation. */
function buildDisplayRows(text: string): DisplayRow[] {
  const lines = stripAnsi(text).split("\n");
  const rows: DisplayRow[] = [];
  const indexPos = new Map<string, number>();
  let batch = 0;
  let inCoverage = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^File\s+\|/.test(trimmed) || /^-{5,}\s*\|/.test(trimmed)) {
      inCoverage = true;
      continue;
    }
    if (inCoverage) {
      if (/^Test Suites:/i.test(trimmed) || /^Tests:/i.test(trimmed)) {
        inCoverage = false;
      } else {
        continue;
      }
    }
    if (isCoverageNoise(line)) continue;

    const kind = classifyLogLine(line);
    if (kind === "muted") continue;

    if (kind === "cmd" || /^---\s*\[\d+\/\d+\]/.test(trimmed)) {
      batch += 1;
      indexPos.clear();
    }

    const idx = testLineIndex(line);

    if (idx && (kind === "running" || kind === "pass" || kind === "fail")) {
      const key = `b${batch}-t-${idx}`;
      const parsed = parseTestLine(line);
      const row: DisplayRow = {
        key,
        line,
        kind,
        title: parsed.title,
        duration: parsed.duration,
      };
      const existing = indexPos.get(key);
      if (existing != null) {
        rows[existing] = row;
      } else {
        indexPos.set(key, rows.length);
        rows.push(row);
      }
      continue;
    }

    if (kind === "pass" || kind === "fail" || kind === "skip") {
      const parsed = parseTestLine(line);
      rows.push({
        key: `l-${rows.length}-${parsed.title.slice(0, 24)}`,
        line,
        kind,
        title: parsed.title,
        duration: parsed.duration,
      });
      continue;
    }

    if (kind === "suite-pass" || kind === "suite-fail") {
      rows.push({
        key: `suite-${rows.length}`,
        line: formatSuiteLine(line),
        kind,
        title: formatSuiteLine(line),
      });
      continue;
    }

    if (kind === "group") {
      rows.push({
        key: `group-${rows.length}-${trimmed.slice(0, 24)}`,
        line: trimmed,
        kind,
        title: trimmed,
      });
      continue;
    }

    rows.push({ key: `l-${rows.length}-${trimmed.slice(0, 16)}`, line: trimmed, kind });
  }

  return rows;
}

function LogRowContent({ row }: { row: DisplayRow }) {
  if (row.kind === "group") {
    return <span className="sheet-e2e-run-log__group-label">{row.title}</span>;
  }

  if (row.kind === "suite-pass" || row.kind === "suite-fail") {
    return (
      <span className="sheet-e2e-run-log__suite">
        <span className="sheet-e2e-run-log__suite-badge">
          {row.kind === "suite-pass" ? "PASS" : "FAIL"}
        </span>
        <span className="sheet-e2e-run-log__suite-file">{row.title}</span>
      </span>
    );
  }

  if (
    (row.kind === "pass" || row.kind === "fail" || row.kind === "skip") &&
    row.title
  ) {
    return (
      <span className="sheet-e2e-run-log__test-line">
        <span>{row.title}</span>
        {row.duration ? (
          <span className="sheet-e2e-run-log__duration">{row.duration}</span>
        ) : null}
      </span>
    );
  }

  return <span>{row.line}</span>;
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
          row.kind === "skip" ||
          row.kind === "summary-pass" ||
          row.kind === "summary-fail";

        return (
          <div
            key={row.key}
            className={cn(
              "sheet-e2e-run-log__row",
              row.kind === "group" && "sheet-e2e-run-log__row--group",
              (row.kind === "suite-pass" || row.kind === "suite-fail") &&
                "sheet-e2e-run-log__row--suite",
            )}
          >
            {showIcon ? <LineIcon kind={row.kind} /> : <span className="sheet-e2e-run-log__icon" />}
            <span className={cn("sheet-e2e-run-log__text", LOG_LINE_CLASS[row.kind])}>
              <LogRowContent row={row} />
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
