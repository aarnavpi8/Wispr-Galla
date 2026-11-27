"use client";

import type { ReactNode } from "react";

import { LANGS } from "@/lib/i18n";

import { useLang } from "./language";
import { Logo } from "./Logo";

/**
 * Welcome screens (language, sign-in, shop setup) on desktop: a brand panel on the left and the
 * form on the right. On phones it is just the form, exactly as before.
 */
export function DesktopFrame({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const samples = [t("ex1"), t("ex2"), t("ex3"), t("ex4")];

  return (
    <div className="flex min-h-dvh w-full lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-gradient-to-br from-forest-800 via-forest-900 to-forest-950 p-12 text-white lg:flex lg:flex-col lg:justify-between"
      >
        <div className="pointer-events-none absolute -right-32 -top-32 size-[30rem] rounded-full border-[56px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[32rem] rounded-full bg-lime-300/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Logo size={52} tone="dark" />
        </div>

        <div className="relative max-w-lg">
          <p className="text-5xl font-extrabold leading-tight tracking-tight">
            {t("loginTitle1")} <span className="text-lime-300">{t("loginTitleAccent")}</span> {t("loginTitle2")}
          </p>
          <p className="mt-4 text-lg text-white/70">{t("loginSub")}</p>
          <ul className="mt-8 space-y-3">
            {samples.map((s, i) => (
              <li
                key={s}
                className="animate-rise flex items-start gap-3 rounded-2xl bg-white/10 px-5 py-4 text-lg ring-1 ring-white/10 backdrop-blur"
                style={{ animationDelay: `${200 + i * 150}ms` }}
              >
                <span className="mt-0.5 text-lime-300">🎙</span>“{s}”
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">{LANGS.map((l) => l.name).join(" · ")}</p>
      </aside>

      <div className="flex w-full items-start justify-center lg:items-center lg:overflow-y-auto lg:py-8">{children}</div>
    </div>
  );
}
