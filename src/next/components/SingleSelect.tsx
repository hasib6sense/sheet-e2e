"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";

export type SingleSelectOption = {
  value: string;
  label: string;
};

type SingleSelectProps = {
  options: SingleSelectOption[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={cn(
        "h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-150",
        open && "rotate-180",
      )}
    >
      <path
        d="M5.25 7.75 10 12.5l4.75-4.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SingleSelect({
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select…",
  className,
}: SingleSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled || !options.length}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal shadow-sm",
          "hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left text-neutral-900">{triggerLabel}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[199] cursor-default"
            aria-label="Close select"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute z-[200] mt-1.5 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-xl"
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "flex w-full items-center px-3 py-2.5 text-left text-sm",
                    active
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-800 hover:bg-neutral-50",
                  )}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
