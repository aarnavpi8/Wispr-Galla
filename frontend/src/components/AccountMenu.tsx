"use client";

import { useState } from "react";

import { initials } from "@/lib/format";
import { LANGS } from "@/lib/i18n";

import { GoogleIcon, useAuth } from "./auth";
import { useLang } from "./language";
import { Sheet } from "./Sheet";

/**
 * Avatar button that opens the profile panel. The panel is a bottom sheet rendered at the end
 * of <body> (portal), so no card on the dashboard can cover the Logout button.
 */
export function AccountMenu({
  onShowTour,
  onLanguage,
  compact = false,
}: {
  onShowTour?: () => void;
  onLanguage?: () => void;
  compact?: boolean;
}) {
  const { status, user } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const label = user?.name ?? (status === "guest" ? t("guest") : t("account"));

  return (
    <>
      <button
        type="button"
        aria-label={`${t("account")}: ${label}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold transition hover:scale-105 active:scale-95 ${
          compact
            ? "size-9 bg-white/15 text-xs text-white ring-1 ring-white/30"
            : "size-12 border-2 border-surface bg-iris-100 text-ink-800 shadow-sm ring-1 ring-line hover:ring-iris-500"
        }`}
      >
        <Avatar />
      </button>
      {open && (
        <ProfileSheet
          onClose={() => setOpen(false)}
          onShowTour={onShowTour}
          onLanguage={onLanguage}
        />
      )}
    </>
  );
}

function Avatar({ big = false }: { big?: boolean }) {
  const { user } = useAuth();
  if (user?.photoURL)
    // Google profile photos are on googleusercontent.com; a plain img avoids image config.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />;
  if (user) return <>{initials(user.name)}</>;
  return <span aria-hidden className={big ? "text-3xl" : ""}>👤</span>;
}

function ProfileSheet({
  onClose,
  onShowTour,
  onLanguage,
}: {
  onClose: () => void;
  onShowTour?: () => void;
  onLanguage?: () => void;
}) {
  const { status, user, signIn, signOut, error } = useAuth();
  const { t, lang } = useLang();
  const [busy, setBusy] = useState(false);

  const row =
    "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-base font-semibold transition active:scale-[0.99]";

  return (
    <Sheet title={t("account")} onClose={onClose}>
      <div className="flex items-center gap-4 rounded-3xl bg-iris-100 p-4">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600 text-xl font-bold text-gold-300 ring-4 ring-surface">
          <Avatar big />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-ink-950">
            {user?.name ?? (status === "disabled" || status === "loading" ? t("demoShop") : t("demoMode"))}
          </p>
          {user?.email && <p className="truncate text-sm text-muted">{user.email}</p>}
          {!user && (
            <p className="text-sm text-muted">
              {status === "disabled" || status === "loading" ? t("loginOffNote") : t("demoModeSub")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {onLanguage && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onLanguage();
            }}
            className={`${row} bg-surface-2 text-ink-900 hover:bg-line`}
          >
            <span aria-hidden className="text-xl">
              अ/A
            </span>
            <span className="flex-1">{t("language")}</span>
            <span className="text-sm font-normal text-muted">{LANGS.find((l) => l.code === lang)?.name}</span>
          </button>
        )}
        {onShowTour && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onShowTour();
            }}
            className={`${row} bg-surface-2 text-ink-900 hover:bg-line`}
          >
            <span aria-hidden className="text-xl">
              🧭
            </span>
            {t("howToUse")}
          </button>
        )}

        {(status === "signed-out" || status === "guest") && (
          <>
            {error && <p className="px-1 text-sm text-money-out">{t(error)}</p>}
            <button
              type="button"
              onClick={() => void signIn()}
              className={`${row} justify-center border-2 border-line bg-surface text-ink-950 hover:border-iris-500 hover:bg-iris-100`}
            >
              <GoogleIcon /> {t("googleLogin")}
            </button>
          </>
        )}

        {status === "signed-in" && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className={`${row} mt-2 justify-center border-2 border-red-200 bg-red-50 text-money-out hover:bg-red-100 disabled:opacity-60`}
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
            </svg>
            {t("logout")}
          </button>
        )}
      </div>
    </Sheet>
  );
}
