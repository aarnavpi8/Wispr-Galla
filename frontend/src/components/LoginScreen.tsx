"use client";

import { GoogleIcon, useAuth } from "./auth";
import { Magnetic, Spotlight, TiltCard } from "./interactive";
import { useLang } from "./language";
import { Logo } from "./Logo";

/** Shown only when Google login is configured and nobody is signed in. */
export function LoginScreen() {
  const { signIn, continueAsGuest, error } = useAuth();
  const { t } = useLang();
  const samples = [t("ex1"), t("ex2"), t("ex4")];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between gap-8 px-5 py-8">
      <div className="animate-rise flex items-center gap-2 text-forest-900">
        <Logo size={40} />
      </div>

      <section className="animate-rise [animation-delay:80ms]">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-forest-950">
          {t("loginTitle1")} <span className="text-leaf-500">{t("loginTitleAccent")}</span> {t("loginTitle2")}
        </h1>
        <p className="mt-3 text-lg text-muted">{t("loginSub")}</p>

        <TiltCard className="mt-6 rounded-3xl bg-forest-900 p-5 text-white shadow-xl shadow-forest-900/20">
          <p className="text-sm text-leaf-300">{t("youSay")}</p>
          <ul className="mt-2 space-y-2">
            {samples.map((s, i) => (
              <li
                key={s}
                className="animate-rise rounded-2xl bg-white/10 px-4 py-3 text-base"
                style={{ animationDelay: `${200 + i * 120}ms` }}
              >
                “{s}”
              </li>
            ))}
          </ul>
        </TiltCard>
      </section>

      <section className="animate-rise space-y-3 [animation-delay:240ms]">
        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-money-out">
            {t(error)}
          </p>
        )}
        <Magnetic strength={0.12} className="flex w-full">
          <Spotlight
            as="button"
            type="button"
            onClick={signIn}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface text-lg font-semibold text-forest-950 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
          >
            <GoogleIcon />
            {t("loginGoogle")}
          </Spotlight>
        </Magnetic>
        <button
          type="button"
          onClick={continueAsGuest}
          className="min-h-14 w-full rounded-2xl text-base font-semibold text-forest-800 underline-offset-4 transition hover:bg-mint-100 hover:underline"
        >
          {t("loginDemo")}
        </button>
      </section>
    </main>
  );
}
