"use client";

import { type FormEvent, useState } from "react";

import { postJSON } from "@/lib/api";
import type { StringKey } from "@/lib/i18n";
import { revealFrom } from "@/lib/transition";

import { useAuth } from "./auth";
import { ListenButton } from "./HelpTip";
import { Magnetic } from "./interactive";
import { useLang } from "./language";
import { Logo } from "./Logo";

type Kind = "kirana" | "sabzi" | "medical" | "other";

const KINDS: { kind: Kind; key: StringKey; icon: string }[] = [
  { kind: "kirana", key: "typeKirana", icon: "🛒" },
  { kind: "sabzi", key: "typeSabzi", icon: "🥬" },
  { kind: "medical", key: "typeMedical", icon: "💊" },
  { kind: "other", key: "typeOther", icon: "🏪" },
];

const STEPS = 3;

const field =
  "mt-2 min-h-14 w-full rounded-2xl border-2 border-line bg-surface px-4 text-xl text-forest-950 transition placeholder:text-muted/60 focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-leaf-500/15";

/**
 * First run on a new install: a few questions about the shop, one per step, then the shop is
 * created on the server. Nothing is assumed about location; language comes from the picker.
 */
export function SetupScreen({ onDone }: { onDone: () => void }) {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [vpa, setVpa] = useState("");
  const [cash, setCash] = useState("");
  const [starter, setStarter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canNext = step === 1 ? name.trim().length > 0 : step === 2 ? kind !== null : true;

  const finish = async (x: number, y: number, demo = false) => {
    setBusy(true);
    setError(null);
    try {
      if (demo) await postJSON("/api/setup/demo", {});
      else
        await postJSON("/api/setup", {
          name: name.trim(),
          kind: kind ?? "other",
          vpa: vpa.trim(),
          language: lang,
          opening_cash: Number(cash || 0),
          starter_items: starter && kind !== "other",
        });
      revealFrom(x, y, onDone);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (!canNext) return;
    if (step < STEPS) setStep(step + 1);
  };

  const question = step === 1 ? t("setupName") : step === 2 ? t("setupType") : t("setupMoney");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-6">
      <div className="animate-rise flex items-center justify-between">
        <div className="flex items-center gap-2 text-forest-900">
          <Logo size={40} />
        </div>
        <span className="rounded-full bg-mint-100 px-3 py-1 text-xs font-bold text-forest-800">
          {t("setupStep", { i: step, n: STEPS })}
        </span>
      </div>

      <header className="animate-rise [animation-delay:60ms]">
        <h1 className="text-3xl font-extrabold tracking-tight text-forest-950">
          {user ? `${t(greetingFor())}, ${user.name.split(" ")[0]} 🙏` : t("setupTitle")}
        </h1>
        <p className="mt-1 text-muted">{t("setupSub")}</p>
        {/* Progress bar */}
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < step ? "bg-leaf-500" : "bg-line"}`} />
          ))}
        </div>
      </header>

      <form onSubmit={next} className="flex flex-1 flex-col">
        <div key={step} className="animate-rise flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-2xl font-bold text-forest-950">{question}</h2>
            <ListenButton text={question} className="shrink-0" />
          </div>

          {step === 1 && (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("setupNamePh")}
              aria-label={t("setupName")}
              maxLength={120}
              className={field}
            />
          )}

          {step === 2 && (
            <div role="radiogroup" aria-label={t("setupType")} className="mt-3 grid grid-cols-2 gap-3">
              {KINDS.map((k) => {
                const on = kind === k.kind;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setKind(k.kind)}
                    className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-3xl border-2 p-3 text-center font-semibold transition hover:-translate-y-0.5 active:scale-[0.98] ${
                      on
                        ? "border-forest-800 bg-forest-900 text-white shadow-xl shadow-forest-900/20"
                        : "border-line bg-surface text-forest-950 hover:border-leaf-500"
                    }`}
                  >
                    <span aria-hidden className={`text-4xl transition ${on ? "scale-110" : ""}`}>
                      {k.icon}
                    </span>
                    {t(k.key)}
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="mt-2 space-y-4">
              <label className="block font-semibold text-forest-950">
                {t("setupUpi")} <span className="font-normal text-muted">({t("optional")})</span>
                <input
                  value={vpa}
                  onChange={(e) => setVpa(e.target.value)}
                  placeholder={t("setupUpiPh")}
                  inputMode="email"
                  autoCapitalize="off"
                  maxLength={120}
                  className={field}
                />
              </label>
              <label className="block font-semibold text-forest-950">
                {t("setupCash")} <span className="font-normal text-muted">({t("optional")})</span>
                <input
                  value={cash}
                  onChange={(e) => setCash(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                  inputMode="numeric"
                  className={`${field} tabular-nums`}
                />
              </label>
              {kind !== "other" && (
                <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-mint-100 px-4 py-3 font-semibold text-forest-900">
                  <input
                    type="checkbox"
                    checked={starter}
                    onChange={(e) => setStarter(e.target.checked)}
                    className="size-6 shrink-0 accent-[var(--forest-800)]"
                  />
                  {t("setupStarter")}
                </label>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-money-out">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="min-h-14 rounded-2xl bg-surface-2 px-5 font-semibold text-forest-900 transition hover:bg-line"
              >
                {t("tourBack")}
              </button>
            )}
            <Magnetic strength={0.1} className="flex flex-1">
              {step < STEPS ? (
                <button
                  type="submit"
                  disabled={!canNext}
                  className="min-h-14 w-full rounded-2xl bg-forest-900 text-lg font-semibold text-white shadow-lg shadow-forest-900/20 transition hover:bg-forest-800 active:scale-[0.98] disabled:bg-line disabled:text-muted disabled:shadow-none"
                >
                  {t("next")} →
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    void finish(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
                  }}
                  className="min-h-14 w-full rounded-2xl bg-forest-900 text-lg font-semibold text-white shadow-lg shadow-forest-900/20 transition hover:bg-forest-800 active:scale-[0.98] disabled:opacity-60"
                >
                  {t("setupStart")} ✓
                </button>
              )}
            </Magnetic>
          </div>
          {step === 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => void finish(e.clientX || window.innerWidth / 2, e.clientY || window.innerHeight - 60, true)}
              className="min-h-12 w-full rounded-2xl text-sm font-semibold text-forest-800 underline-offset-4 transition hover:bg-mint-100 hover:underline"
            >
              {t("setupDemo")}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

function greetingFor(): StringKey {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
