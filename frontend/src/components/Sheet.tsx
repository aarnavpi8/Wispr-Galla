"use client";

import { type ReactNode, useEffect } from "react";
import { useLang } from "./language";

/** Bottom sheet: dimmed backdrop, drag handle look, Escape or backdrop tap closes it. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  closeLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  const { t } = useLang();
  closeLabel ??= t("close");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center" role="dialog" aria-modal>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="animate-[rise_0.2s_both] absolute inset-0 bg-forest-950/40 backdrop-blur-[2px]"
      />
      <div className="animate-sheet relative max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] bg-surface p-5 pb-8 shadow-2xl">
        <div aria-hidden className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-forest-950">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl text-muted transition hover:rotate-90 hover:bg-line"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
