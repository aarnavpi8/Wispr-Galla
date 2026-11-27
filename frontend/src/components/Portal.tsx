"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders overlays (help popups, bottom sheets) at the end of <body>.
 * Cards here tilt or lift with CSS transforms, and a transformed ancestor traps a
 * `position: fixed` child inside itself. A portal also keeps dialogs out of <p>/<h2> text.
 */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
