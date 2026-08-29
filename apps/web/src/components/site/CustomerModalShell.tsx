"use client";

import type { ReactNode } from "react";

type CustomerModalShellProps = {
  children: ReactNode;
  ariaLabel: string;
  maxWidthClassName?: string;
  maxHeightClassName?: string;
  mobileSheet?: boolean;
};

type CustomerModalHeaderProps = {
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  eyebrow?: ReactNode;
  description?: ReactNode;
  titleClassName?: string;
};

export default function CustomerModalShell({
  children,
  ariaLabel,
  maxWidthClassName = "max-w-xl",
  maxHeightClassName = "max-h-[85vh]",
  mobileSheet = false,
}: CustomerModalShellProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-stone-900/35 p-3 backdrop-blur-[2px] sm:p-4 ${
        mobileSheet ? "items-end md:items-center" : "items-center"
      }`}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`flex w-full flex-col overflow-hidden rounded-[2rem] border border-[#87362E]/10 bg-[#fffaf5] shadow-[0_28px_80px_-34px_rgba(100,45,38,0.55)] ${maxWidthClassName} ${maxHeightClassName}`}
      >
        {children}
      </section>
    </div>
  );
}

export function CustomerModalHeader({
  title,
  closeLabel,
  onClose,
  eyebrow,
  description,
  titleClassName = "text-xl",
}: CustomerModalHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#87362E]/10 px-5 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#87362E]/60">
            {eyebrow}
          </p>
        ) : null}
        <h3
          className={`${eyebrow ? "mt-1" : ""} font-black tracking-tight text-stone-900 ${titleClassName}`}
        >
          {title}
        </h3>
        {description ? (
          <div className="mt-1.5 text-sm leading-5 text-stone-500">
            {description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full border border-[#87362E]/15 bg-white px-3.5 py-2 text-xs font-bold text-[#87362E] transition hover:border-[#87362E]/30 hover:bg-[#fff3ea]"
      >
        {closeLabel}
      </button>
    </div>
  );
}
