"use client";

import { useState } from "react";
import { cn } from "../cn";
import { Checkbox } from "./Checkbox";

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
    <div className="relative">
      <button
        type="button"
        disabled={disabled || !options.length}
        aria-expanded={open}
        onClick={() => handleOpenChange(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal shadow-sm",
          "hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
        <span className={cn("text-neutral-400 transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[199] cursor-default"
            aria-label="Close module picker"
            onClick={() => handleOpenChange(false)}
          />
          <div className="absolute z-[200] mt-1.5 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-2">
              <p className="text-xs font-medium text-neutral-600">Select one or more modules</p>
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 hover:bg-neutral-50"
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
                  <span className="flex-1 text-sm text-neutral-900">{opt.label}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {opt.count}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
