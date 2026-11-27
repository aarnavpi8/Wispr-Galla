"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useApi } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { greetingKey, LANGS } from "@/lib/i18n";
import type { Accounts, EntryOut, PartyBalance, ShopSummary, Summary } from "@/lib/types";

import { AccountMenu } from "./AccountMenu";
import { AccountsCard } from "./AccountsCard";
import { useAuth } from "./auth";
import { BottomNav, type NavId } from "./BottomNav";
import { CaptureCard } from "./CaptureCard";
import { EntryList } from "./EntryList";
import { HeroCard } from "./HeroCard";
import { InventoryCard } from "./InventoryCard";
import { KhataList } from "./KhataList";
import { PartySheet } from "./PartySheet";
import { Spotlight } from "./interactive";
import { LanguagePicker } from "./LanguagePicker";
import { useLang } from "./language";
import { Reveal } from "./Reveal";
import { StickySummary } from "./StickySummary";
import { WeekChart } from "./WeekChart";
import { ColorLegend } from "./HelpTip";
import { Tour, tourSeen } from "./Tour";

type Tab = "hisaab" | "khata";

export function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useLang();
  const [picking, setPicking] = useState(false);
  // Bumped when stock or the day close changes, so totals elsewhere refresh.
  const [refresh, setRefresh] = useState(0);
  const bump = useCallback(() => setRefresh((r) => r + 1), []);

  const shop = useApi<ShopSummary>("/api/shop");
  const summary = useApi<Summary>(`/api/summary?days=7&r=${refresh}`);
  const accounts = useApi<Accounts>(`/api/accounts?days=7&r=${refresh}`);
  const entries = useApi<EntryOut[]>("/api/entries?limit=30");
  const khata = useApi<PartyBalance[]>("/api/khata");

  const [tab, setTab] = useState<Tab>("hisaab");
  const [openParty, setOpenParty] = useState<PartyBalance | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [heroGone, setHeroGone] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const hasSummary = !!summary.data;
  const [touring, setTouring] = useState(false);

  // First visit: once the screen has data and settled, offer the guided tour.
  useEffect(() => {
    if (!hasSummary || tourSeen()) return;
    const id = window.setTimeout(() => setTouring(true), 900);
    return () => window.clearTimeout(id);
  }, [hasSummary]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Show the compact summary bar once the big money card has scrolled off the top.
  useEffect(() => {
    const el = hero.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0, rootMargin: "-40px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasSummary]);

  const closeSheet = useCallback(() => setOpenParty(null), []);
  const error = shop.error ?? summary.error;
  const overdue = khata.data?.filter((p) => p.overdue_since) ?? [];

  const go = (id: NavId) => {
    if (id === "khata") setTab("khata");
    if (id === "aaj") window.scrollTo({ top: 0, behavior: "smooth" });
    else document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const speak = () => {
    const box = document.getElementById("capture") as HTMLTextAreaElement | null;
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => box?.focus({ preventScroll: true }), 350);
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-36 pt-5">
      <StickySummary
        visible={heroGone}
        shopName={shop.data?.name ?? ""}
        expected={summary.data?.expected_cash_today ?? 0}
        receivable={accounts.data?.receivable ?? summary.data?.udhaar_outstanding ?? 0}
        lowStock={accounts.data?.low_stock ?? 0}
        onTap={() => go("aaj")}
        onLowStock={() => go("maal")}
      />

      <header id="aaj" className="animate-rise flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {t(greetingKey(new Date().getHours()))}
            {user ? `, ${user.name.split(" ")[0]}` : ""} 🙏
          </p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-forest-950">
            {shop.data?.name ?? <span className="skeleton inline-block h-7 w-48 rounded-lg align-middle" />}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t("language")}
            className="flex h-12 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-forest-900 shadow-sm transition hover:-translate-y-0.5 hover:border-leaf-500 hover:bg-mint-100"
          >
            <span aria-hidden>अ/A</span>
            <span className="hidden sm:inline">{LANGS.find((l) => l.code === lang)?.name}</span>
          </button>
          <AccountMenu onShowTour={() => setTouring(true)} />
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 p-3 text-money-out ring-1 ring-red-200">
          {error}
        </p>
      )}

      {shop.data && !shop.data.llm_configured && (
        <p className="animate-rise flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-muted">
          <span className="size-2 rounded-full bg-leaf-500" /> {t("aiOff")}
        </p>
      )}

      <div ref={hero} id="tour-hero" className="space-y-2">
        {summary.data ? <HeroCard summary={summary.data} /> : <div className="skeleton h-64 rounded-[28px]" />}
        <ColorLegend className="justify-center" />
      </div>

      <div id="tour-capture">
        <CaptureCard onSubmit={() => setToast(t("notSaved"))} />
      </div>

      {overdue.length > 0 && summary.data && (
        <Spotlight
          as="button"
          type="button"
          onClick={() => setOpenParty(overdue[0])}
          className="animate-rise flex items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md [--spot:rgb(245_158_11/0.18)]"
        >
          <span className="text-2xl" aria-hidden>
            ⏰
          </span>
          <span className="flex-1">
            <span className="block font-bold text-pending">{t("overdue", { n: overdue.length })}</span>
            <span className="text-sm text-muted">
              {t("overdueSub", { x: formatINR(summary.data.udhaar_outstanding) })}
            </span>
          </span>
          <span aria-hidden className="text-pending">
            ›
          </span>
        </Spotlight>
      )}

      <Reveal id="hisaab">
        <AccountsCard refreshKey={refresh} onChanged={bump} />
      </Reveal>

      {summary.data && (
        <Reveal>
          <WeekChart days={summary.data.days} />
        </Reveal>
      )}

      <Reveal id="maal">
        <InventoryCard onChanged={bump} />
      </Reveal>

      <Reveal id="khata">
        <section className="rounded-[28px] border border-line bg-surface p-4 shadow-sm">
          <div role="tablist" aria-label="Hisaab ya khata" className="relative mb-3 grid grid-cols-2 rounded-2xl bg-surface-2 p-1">
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-forest-900 shadow transition-transform duration-300 ease-out"
              style={{ transform: tab === "khata" ? "translateX(100%)" : "none" }}
            />
            {(["hisaab", "khata"] as const).map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={`relative min-h-11 rounded-xl font-semibold transition-colors ${
                  tab === name ? "text-white" : "text-muted hover:text-forest-900"
                }`}
              >
                {name === "hisaab" ? t("tabEntries") : `${t("tabKhata")}${khata.data ? ` (${khata.data.length})` : ""}`}
              </button>
            ))}
          </div>

          {tab === "hisaab" &&
            (entries.data ? (
              <EntryList entries={entries.data} />
            ) : (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-14 rounded-2xl" />
                ))}
              </div>
            ))}
          {tab === "khata" && khata.data && <KhataList parties={khata.data} onOpen={setOpenParty} />}
        </section>
      </Reveal>

      <BottomNav onGo={go} onSpeak={speak} lowStock={accounts.data?.low_stock ?? 0} overdue={overdue.length} />

      {picking && (
        <div className="animate-pop fixed inset-0 z-[58] overflow-y-auto bg-background">
          <LanguagePicker onDone={() => setPicking(false)} />
        </div>
      )}

      {touring && <Tour onClose={() => setTouring(false)} />}

      {openParty && <PartySheet party={openParty} shop={shop.data} onClose={closeSheet} />}

      {toast && (
        <div
          role="status"
          className="animate-pop fixed inset-x-4 bottom-28 z-50 mx-auto max-w-md rounded-2xl bg-forest-950 px-4 py-3 text-white shadow-2xl"
        >
          {toast}
        </div>
      )}
    </main>
  );
}
