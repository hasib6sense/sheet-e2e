"use client";

import { cn } from "../cn";

type CheckboxProps = {
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (checked: boolean) => void;
  className?: string;
  "aria-label"?: string;
  id?: string;
};

/** Accessible checkbox with centered checkmark (avoids native accent misalignment). */
export function Checkbox({
  checked = false,
  disabled,
  onCheckedChange,
  onChange,
  className,
  id,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const setChecked = (next: boolean) => {
    onCheckedChange?.(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;
        setChecked(!checked);
      }}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-transparent hover:border-neutral-400",
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="h-3 w-3"
      >
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
      </svg>
    </button>
  );
}
