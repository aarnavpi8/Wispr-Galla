"use client";

import { type ReactNode, useId, useRef } from "react";

import { useDialog } from "@/hooks/useDialog";

import { useLang } from "./language";
import { Portal } from "./Portal";

/**
 * Bottom sheet on phones, centred dialog on larger screens. Dimmed backdrop; Escape, the ×
 * or a backdrop tap closes it. Focus moves inside and returns to the opener on close.
 */
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
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(panel, onClose);

  return (
    <Portal>
      <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-labelledby={titleId}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={closeLabel}
          onClick={onClose}
          className="animate-[rise_0.2s_both] absolute inset-0 bg-ink-950/25 backdrop-blur-[3px]"
        />
        <div
          ref={panel}
          className="animate-sheet sm:animate-pop relative max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[32px] bg-surface p-5 pb-8 shadow-2xl sm:max-w-lg sm:rounded-[32px] sm:p-7"
        >
          <div aria-hidden className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line sm:hidden" />
          <div className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-xl font-bold text-ink-950">
                {title}
              </h2>
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
    </Portal>
  );
}
