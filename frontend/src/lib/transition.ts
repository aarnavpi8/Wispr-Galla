import { flushSync } from "react-dom";

type DocWithVT = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * Switch screens with a circular reveal that grows from (x, y), e.g. the button tapped.
 * Uses the browser's View Transitions API; where it's missing (or reduced motion is on)
 * the update just happens.
 */
export function revealFrom(x: number, y: number, update: () => void): void {
  const doc = document as DocWithVT;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    update();
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.classList.add("vt-reveal");
  const vt = doc.startViewTransition(() => flushSync(update));
  vt.finished.finally(() => root.classList.remove("vt-reveal"));
}
