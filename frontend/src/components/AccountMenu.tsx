"use client";

import { useEffect, useRef, useState } from "react";

import { initials } from "@/lib/format";

import { GoogleIcon, useAuth } from "./auth";
import { useLang } from "./language";

/** Avatar in the top bar. Opens a small menu with login state, sign in / out and the tour. */
export function AccountMenu({ onShowTour }: { onShowTour?: () => void }) {
  const { status, user, signIn, signOut, error } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const label = user?.name ?? (status === "guest" ? t("guest") : t("account"));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={`${t("account")}: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-12 place-items-center overflow-hidden rounded-full border-2 border-surface bg-mint-100 font-bold text-forest-800 shadow-sm ring-1 ring-line transition hover:scale-105 hover:ring-leaf-500 active:scale-95"
      >
        {user?.photoURL ? (
          // Google profile photos are on googleusercontent.com; a plain img avoids image config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : user ? (
          initials(user.name)
        ) : (
          <span aria-hidden>👤</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 top-14 z-40 w-72 origin-top-right rounded-3xl border border-line bg-surface p-4 shadow-xl shadow-forest-950/10"
        >
          {status === "signed-in" && user && (
            <>
              <p className="font-semibold text-forest-950">{user.name}</p>
              {user.email && <p className="truncate text-sm text-muted">{user.email}</p>}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className="mt-4 min-h-12 w-full rounded-2xl bg-surface-2 font-semibold text-forest-900 transition hover:bg-mint-100"
              >
                {t("logout")}
              </button>
            </>
          )}

          {(status === "signed-out" || status === "guest") && (
            <>
              <p className="font-semibold text-forest-950">{t("demoMode")}</p>
              <p className="text-sm text-muted">{t("demoModeSub")}</p>
              {error && <p className="mt-2 text-sm text-money-out">{t(error)}</p>}
              <button
                type="button"
                role="menuitem"
                onClick={() => void signIn()}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface font-semibold text-forest-950 transition hover:border-leaf-500 hover:bg-mint-100"
              >
                <GoogleIcon /> {t("googleLogin")}
              </button>
            </>
          )}

          {(status === "disabled" || status === "loading") && (
            <>
              <p className="font-semibold text-forest-950">{t("demoShop")}</p>
              <p className="mt-1 text-sm text-muted">{t("loginOffNote")}</p>
            </>
          )}

          {onShowTour && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShowTour();
              }}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-mint-100 font-semibold text-forest-900 transition hover:bg-leaf-300"
            >
              <span aria-hidden>🧭</span> {t("howToUse")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
