"use client";

import { useRef } from "react";

import { useDialog } from "@/hooks/useDialog";
import type { Command, Item, PartyBalance } from "@/lib/types";

import { CaptureCard } from "./CaptureCard";
import { useLang } from "./language";
import { Portal } from "./Portal";

/**
 * The speaking bubble: pops up above the big mic button and starts listening at once.
 * Pressing the big mic again stops listening; then the entry card opens as usual.
 * The bottom bar stays above the dimmed page, so the big mic can still be pressed.
 */
export function VoiceBubble({
  micPresses,
  onClose,
  onSubmit,
  onCommand,
  parties,
  items,
}: {
  micPresses: number;
  onClose: () => void;
  onSubmit: (text: string) => void;
  onCommand: (command: Command, partyId?: number | null) => void;
  parties: PartyBalance[];
  items: Item[];
}) {
  const { t } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, onClose);

  return (
    <Portal>
      <div className="fixed inset-0 z-20" role="dialog" aria-modal aria-label={t("speakOrType")}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("close")}
          onClick={onClose}
          className="animate-[rise_0.2s_both] absolute inset-0 bg-ink-950/25"
        />
        <div ref={panel} className="animate-pop absolute inset-x-4 bottom-32 mx-auto max-w-md lg:bottom-10">
          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain rounded-[28px] shadow-2xl">
            <CaptureCard
              listenOnOpen
              micPresses={micPresses}
              onSubmit={onSubmit}
              onCommand={onCommand}
              parties={parties}
              items={items}
            />
          </div>
          {/* The bubble's tail, pointing down at the big mic button. */}
          <span aria-hidden className="absolute -bottom-2 left-1/2 size-5 -translate-x-1/2 rotate-45 rounded-sm border-b border-r border-line bg-surface lg:hidden" />
          {/* Focus lands here, not in the text box, so the phone keyboard doesn't jump up. */}
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label={t("close")}
            className="absolute -right-2 -top-3 grid size-9 place-items-center rounded-full border border-line bg-surface text-lg text-muted shadow-md transition hover:bg-surface-2"
          >
            ×
          </button>
        </div>
      </div>
    </Portal>
  );
}
