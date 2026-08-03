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
      className={cn("sheet-e2e-select__chevron", open && "sheet-e2e-select__chevron--open")}
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
    <div ref={rootRef} className={cn("sheet-e2e-select", open && "sheet-e2e-select--open", className)}>
      <button
        type="button"
        disabled={disabled || !options.length}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="sheet-e2e-select__trigger"
      >
        <span className="sheet-e2e-select__trigger-label">{triggerLabel}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="sheet-e2e-select__backdrop"
            aria-label="Close select"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="sheet-e2e-select__menu"
            style={{ paddingTop: 4, paddingBottom: 4 }}
          >
            <div
              className="sheet-e2e-select__menu-scroll"
              onWheel={(e) => e.stopPropagation()}
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
                      "sheet-e2e-select__option",
                      active && "sheet-e2e-select__option--active",
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
          </div>
        </>
      )}
    </div>
  );
}
