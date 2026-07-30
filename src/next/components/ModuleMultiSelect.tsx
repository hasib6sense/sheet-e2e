"use client";

import { useState } from "react";
import { cn } from "../cn";
import { Checkbox } from "./Checkbox.tsx";

export type ModuleOption = {
  value: string;
  label: string;
  count: number;
};

type ModuleMultiSelectProps = {
  options: ModuleOption[];
  value: string[];
  onChange: (next: string[]) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
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

export function ModuleMultiSelect({
  options,
  value,
  onChange,
  onOpenChange,
  disabled,
}: ModuleMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const toggle = (moduleValue: string) => {
    if (value.includes(moduleValue)) {
      const next = value.filter((v) => v !== moduleValue);
      if (next.length === 0) return;
      onChange(next);
    } else {
      onChange([...value, moduleValue]);
    }
  };

  const triggerLabel =
    value.length === 0
      ? "Select modules…"
      : value.length === 1
        ? `${value[0]} (${options.find((o) => o.value === value[0])?.count ?? 0} tests)`
        : `${value.length} modules selected`;

  return (
    <div className="sheet-e2e-select">
      <button
        type="button"
        disabled={disabled || !options.length}
        aria-expanded={open}
        onClick={() => handleOpenChange(!open)}
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
            aria-label="Close module picker"
            onClick={() => handleOpenChange(false)}
          />
          <div className="sheet-e2e-select__menu">
            <div className="sheet-e2e-select__menu-header">
              <p>Select one or more modules</p>
            </div>
            <div
              className="sheet-e2e-select__menu-scroll"
              onWheel={(e) => e.stopPropagation()}
            >
              {options.map((opt) => (
                <label
                  key={opt.value}
                  className="sheet-e2e-select__option"
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(opt.value);
                  }}
                >
                  <Checkbox
                    checked={value.includes(opt.value)}
                    onCheckedChange={() => toggle(opt.value)}
                    aria-label={opt.label}
                  />
                  <span className="sheet-e2e-select__option-label">{opt.label}</span>
                  <span className="sheet-e2e-select__count">{opt.count}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
