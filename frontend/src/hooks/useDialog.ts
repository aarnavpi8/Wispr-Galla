"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, newest last: only the top one handles Tab and Escape (a sheet opened from a sheet). */
const stack: { id: symbol; el: HTMLElement | null }[] = [];

/**
 * Accessible dialog behaviour for sheets and popups:
 * moves focus inside on open (an input if there is one, else the first button), keeps Tab
 * inside the panel, closes on Escape, locks page scroll, and puts focus back where it was.
 * If the opener is gone by then (e.g. "Add it" vanishes once the item exists), focus goes to
 * the dialog underneath instead of falling out to the page.
 */
export function useDialog(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const me = Symbol("dialog");
    const el = panel.current;
    stack.push({ id: me, el });
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => (el ? [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement) : []);

    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("input, textarea") ?? focusables()[0];
    first?.focus({ preventScroll: true });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const keys = (e: KeyboardEvent) => {
      if (stack[stack.length - 1]?.id !== me) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const list = focusables();
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || !el.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !el.contains(document.activeElement))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      const at = stack.findIndex((d) => d.id === me);
      if (at >= 0) stack.splice(at, 1);
      document.body.style.overflow = prevOverflow;
      if (opener?.isConnected && opener !== document.body) {
        opener.focus({ preventScroll: true });
        return;
      }
      const below = stack[stack.length - 1]?.el;
      if (below?.isConnected) {
        const next = below.querySelector<HTMLElement>(FOCUSABLE);
        if (next) next.focus({ preventScroll: true });
        else {
          below.tabIndex = -1;
          below.focus({ preventScroll: true });
        }
      }
    };
  }, [panel]);
}
