"use client";

import { useEffect, useRef } from "react";
import { classifyLogLine, LOG_LINE_CLASS, stripAnsi, type LogLineKind } from "../../strip-ansi";
import { cn } from "../cn";

function LineIcon({ kind }: { kind: LogLineKind }) {
  if (kind === "pass" || kind === "summary-pass") {
    return <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>✓</span>;
  }
  if (kind === "fail" || kind === "summary-fail") {
    return <span className="mt-0.5 shrink-0 text-red-400" aria-hidden>✘</span>;
  }
  return <span className="w-3.5 shrink-0" aria-hidden />;
}

type RunLogProps = {
  text: string;
  expanded?: boolean;
};

export function RunLog({ text, expanded = false }: RunLogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = stripAnsi(text).split("\n");

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-auto rounded-md bg-neutral-950/50 p-3 font-mono text-xs leading-relaxed",
        expanded ? "max-h-72" : "max-h-36",
      )}
    >
      {lines.map((line, i) => {
        const kind = classifyLogLine(line);
        const showIcon =
          kind === "pass" || kind === "fail" || kind === "summary-pass" || kind === "summary-fail";

        return (
          <div key={`${i}-${line.slice(0, 24)}`} className="flex gap-2">
            {showIcon ? <LineIcon kind={kind} /> : <span className="w-3.5 shrink-0" />}
            <span
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap break-words",
                LOG_LINE_CLASS[kind],
              )}
            >
              {line || "\u00a0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
