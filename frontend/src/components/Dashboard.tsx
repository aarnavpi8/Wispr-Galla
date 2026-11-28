"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { postJSON, useApi } from "@/lib/api";
import { readAloud } from "@/lib/speak";
import { formatINR, formatNumber } from "@/lib/format";
import { greetingKey, LANGS, speechCode } from "@/lib/i18n";
import type { Accounts, Command, EntryOut, ExtractedEntry, Item, PartyBalance, ShopSummary, Summary } from "@/lib/types";

import { AccountMenu } from "./AccountMenu";
import { AccountsCard } from "./AccountsCard";
import { AddItemSheet } from "./AddItemSheet";
import { BillScanSheet } from "./BillScanSheet";
import { DayCloseSheet } from "./DayCloseSheet";
import { DesktopSidebar } from "./DesktopSidebar";
import { useAuth } from "./auth";
import { BottomNav, type NavId } from "./BottomNav";
import { CaptureCard } from "./CaptureCard";
import { EntryCard } from "./EntryCard";
import { EntryList } from "./EntryList";
import { HeroCard } from "./HeroCard";
import { InventoryCard } from "./InventoryCard";
import { StockPlanCard } from "./StockPlanCard";
import { KhataList } from "./KhataList";
import { PartySheet } from "./PartySheet";
import { Spotlight } from "./interactive";
import { LanguagePicker } from "./LanguagePicker";
import { useLang } from "./language";
import { Reveal } from "./Reveal";
import { WeekChart } from "./WeekChart";
import { ColorLegend } from "./HelpTip";
import { Tour, tourSeen } from "./Tour";
import { VoiceBubble } from "./VoiceBubble";

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
  const items = useApi<Item[]>(`/api/items?r=${refresh}`);

  const [tab, setTab] = useState<Tab>("hisaab");
  const [khataKind, setKhataKind] = useState<"customer" | "supplier">("customer");
  const [openParty, setOpenParty] = useState<PartyBalance | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [card, setCard] = useState<ExtractedEntry | null>(null);
  const [captureKey, setCaptureKey] = useState(0);
  const [lastSaved, setLastSaved] = useState<EntryOut | null>(null);
  const [voiceSheet, setVoiceSheet] = useState<"day_close" | "scan" | "add_item" | null>(null);
  const [undoAsk, setUndoAsk] = useState<EntryOut | null>(null);

  /** Voice control: everything you can tap, you can also say. */
  const runCommand = (command: Command, partyId?: number | null) => {
    const party = partyId ? khata.data?.find((p) => p.id === partyId) : undefined;
    switch (command) {
      case "day_close":
        setVoiceSheet("day_close");
        break;
      case "show_khata":
      case "send_reminder":
        if (party) setOpenParty(party);
        else go("khata");
        break;
      case "show_stock":
        go("maal");
        break;
      case "scan_bill":
        setVoiceSheet("scan");
        break;
      case "add_item":
        setVoiceSheet("add_item");
        break;
      case "show_accounts":
        go("hisaab");
        break;
      case "show_entries":
        setTab("hisaab");
        go("khata");
        break;
      case "change_language":
        setPicking(true);
        break;
      case "help":
        setTouring(true);
        break;
      case "undo_last": {
        const latest = entries.data?.find((x) => !x.reversed);
        if (latest) setUndoAsk(latest);
        else setToast(t("nothingToUndo"));
        break;
      }
      default:
        go("aaj");
    }
  };

  const understand = async (text: string) => {
    setToast(t("understanding"));
    try {
      const entry = await postJSON<ExtractedEntry>("/api/extract", { text });
      setToast(null);
      if (entry.type === "command" && entry.command === "item_stock") {
        // "Cheeni kitni bachi hai?" -> "Cheeni: 12 kg left", on screen and spoken.
        setCaptureKey((k) => k + 1);
        const answer = entry.items.map((li) => t("stockAnswer", { item: li.name, qty: `${formatNumber(li.in_stock ?? 0)} ${li.unit}` })).join(" · ");
        setToast(answer);
        readAloud(answer, speechCode(lang));
      } else if (entry.type === "command" && entry.command) {
        setCaptureKey((k) => k + 1); // clear the speak box
        runCommand(entry.command, entry.party?.match_id ?? null);
      } else {
        setCard(entry);
      }
    } catch (e) {
      setToast((e as Error).message);
    }
  };

  const refreshAll = () => {
    bump();
    entries.reload();
    khata.reload();
  };

  const undo = async (saved: EntryOut) => {
    try {
      await postJSON(`/api/entries/${saved.id}/undo`, {});
      setLastSaved(null);
      setToast(t("undone"));
      refreshAll();
    } catch (e) {
      setToast((e as Error).message);
    }
  };
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

  // 10-second undo after every save.
  useEffect(() => {
    if (!lastSaved) return;
    const id = window.setTimeout(() => setLastSaved(null), 10_000);
    return () => window.clearTimeout(id);
  }, [lastSaved]);

  const closeSheet = useCallback(() => setOpenParty(null), []);
  const error = shop.error ?? summary.error;
  const overdue = khata.data?.filter((p) => p.overdue_since) ?? [];

  // Phones: slide sideways to a page (and down to a section in it). Desktop: scroll the window.
  const pages = useRef<HTMLDivElement>(null);
  const slideTo = (page: NavId, sectionId?: string) => {
    const pageEl = document.getElementById(`page-${page}`);
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (!pageEl) return;
    if (window.matchMedia?.("(min-width: 1024px)").matches) {
      if (page === "aaj" && !section) window.scrollTo({ top: 0, behavior: "smooth" });
      else (section ?? pageEl).scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    pages.current?.scrollTo?.({ left: pageEl.offsetLeft, behavior: "smooth" });
    pageEl.scrollTo?.({ top: section ? section.offsetTop - 8 : 0, behavior: "smooth" });
  };

  const go = (id: NavId) => {
    if (id === "khata") setTab("khata");
    slideTo(id);
  };

  // Summary numbers open what they add up.
  const openKhata = (kind: "customer" | "supplier") => {
    setKhataKind(kind);
    go("khata");
  };
  const openEntries = () => {
    setTab("hisaab");
    slideTo("khata");
  };

  // The big mic button opens the speaking bubble, which starts listening right away.
  // Pressing it again while the bubble is open starts or stops listening.
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [micPresses, setMicPresses] = useState(0);
  const speak = () => {
    if (bubbleOpen) setMicPresses((n) => n + 1);
    else setBubbleOpen(true);
  };

  return (
    <div className="flex w-full flex-1 lg:min-h-dvh">
    <DesktopSidebar
      shopName={shop.data?.name ?? ""}
      expected={summary.data?.expected_cash_today ?? 0}
      receivable={accounts.data?.receivable ?? summary.data?.udhaar_outstanding ?? 0}
      lowStock={accounts.data?.low_stock ?? 0}
      overdue={overdue.length}
      onGo={go}
      onSpeak={speak}
      onLanguage={() => setPicking(true)}
      onShowTour={() => setTouring(true)}
    />
    <main className="mx-auto flex h-dvh w-full max-w-md flex-1 flex-col gap-4 overflow-hidden px-4 pt-5 lg:h-auto lg:max-w-6xl lg:gap-6 lg:overflow-visible lg:px-10 lg:pb-12 lg:pt-8">
      <header className="animate-rise flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {t(greetingKey(new Date().getHours()))}
            {user ? `, ${user.name.split(" ")[0]}` : ""}
          </p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-ink-950 lg:text-4xl">
            {shop.data?.name ?? <span className="skeleton inline-block h-7 w-48 rounded-lg align-middle" />}
          </h1>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t("language")}
            className="flex h-12 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:border-iris-500 hover:bg-iris-100"
          >
            <span aria-hidden>अ/A</span>
            <span className="hidden sm:inline">{LANGS.find((l) => l.code === lang)?.name}</span>
          </button>
          <AccountMenu onShowTour={() => setTouring(true)} onLanguage={() => setPicking(true)} />
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 p-3 text-money-out ring-1 ring-red-200">
          {error}
        </p>
      )}

      {shop.data && !shop.data.llm_configured && (
        <p className="animate-rise flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm text-muted">
          <span className="size-2 rounded-full bg-iris-500" /> {t("aiOff")}
        </p>
      )}

      {/* Phones: swipe left and right between the four pages of the bottom bar. Desktop: two columns. */}
      <div
        ref={pages}
        className="relative -mx-4 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] lg:mx-0 lg:block lg:columns-2 lg:gap-6 lg:overflow-visible"
      >
        <Page id="aaj">
          <div id="tour-hero" className="scroll-mt-24 space-y-2">
            {summary.data ? (
              <HeroCard
                summary={summary.data}
                onOpen={(what) => {
                  if (what === "udhaar") openKhata("customer");
                  else if (what === "out") setVoiceSheet("day_close");
                  else openEntries();
                }}
              />
            ) : (
              <div className="skeleton h-64 rounded-[28px]" />
            )}
            <ColorLegend className="justify-center" />
          </div>
          <div id="tour-capture" className="scroll-mt-24">
            <CaptureCard
              key={captureKey}
              onSubmit={(text) => void understand(text)}
              onCommand={(command, partyId) => {
                setCaptureKey((k) => k + 1);
                runCommand(command, partyId);
              }}
              parties={khata.data ?? []}
              items={items.data ?? []}
            />
          </div>
          {overdue.length> 0 && summary.data && (
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
          {summary.data && (
            <Reveal>
              <WeekChart days={summary.data.days} />
            </Reveal>
          )}
        </Page>
        <Page id="hisaab">
          <Reveal id="hisaab">
            <AccountsCard
              refreshKey={refresh}
              onChanged={bump}
              onOpen={(what) => {
                if (what === "receivable") openKhata("customer");
                else if (what === "payable") openKhata("supplier");
                else if (what === "stock") go("maal");
                else slideTo("maal", "stockplan");
              }}
            />
          </Reveal>
        </Page>
        <Page id="maal">
          <Reveal id="maal">
            <InventoryCard
              refreshKey={refresh}
              onChanged={bump}
              onSold={(entry) => {
                setLastSaved(entry);
                refreshAll();
              }}
              parties={khata.data ?? []}
            />
          </Reveal>
          <Reveal id="stockplan">
            <StockPlanCard refreshKey={refresh} onChanged={bump} />
          </Reveal>
        </Page>
        <Page id="khata">
          <Reveal id="khata">
            <section className="rounded-[28px] border border-line bg-surface p-4 shadow-sm">
              <div role="tablist" aria-label="Hisaab ya khata" className="relative mb-3 grid grid-cols-2 rounded-2xl bg-surface-2 p-1">
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-brand-600 shadow transition-transform duration-300 ease-out"
                  style={{ transform: tab === "khata" ? "translateX(100%)" : "none" }}
                />
                {(["hisaab", "khata"] as const).map((name) => (
                  <button
                    key={name}
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className={`relative min-h-11 rounded-xl font-semibold transition-colors ${
                      tab === name ? "text-white" : "text-muted hover:text-ink-900"
                    }`}
                  >
                    {name === "hisaab" ? t("tabEntries") : `${t("tabKhata")}${khata.data ? ` (${formatNumber(khata.data.length)})` : ""}`}
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
              {tab === "khata" && khata.data && (
                <KhataList parties={khata.data} onOpen={setOpenParty} filter={khataKind} onFilter={setKhataKind} />
              )}
            </section>
          </Reveal>
        </Page>
      </div>

      <div className="lg:hidden">
        <BottomNav onGo={go} onSpeak={speak} lowStock={accounts.data?.low_stock ?? 0} overdue={overdue.length} />
      </div>

      {picking && (
        <div className="animate-pop fixed inset-0 z-[58] overflow-y-auto bg-background">
          <LanguagePicker onDone={() => setPicking(false)} />
        </div>
      )}

      {touring && <Tour onClose={() => setTouring(false)} />}

      {voiceSheet === "day_close" && <DayCloseSheet onClose={() => setVoiceSheet(null)} onSaved={bump} />}
      {voiceSheet === "scan" && items.data && (
        <BillScanSheet items={items.data} onClose={() => setVoiceSheet(null)} onDone={refreshAll} />
      )}
      {voiceSheet === "add_item" && <AddItemSheet onClose={() => setVoiceSheet(null)} onAdded={refreshAll} />}

      {undoAsk && (
        <div role="alertdialog" aria-live="assertive" className="animate-pop fixed inset-x-4 bottom-28 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3 text-white shadow-2xl lg:inset-x-auto lg:bottom-8 lg:right-8 lg:mx-0 lg:w-[28rem]">
          <span className="flex-1">
            {t("undoLastAsk", { x: `${undoAsk.party_name ? `${undoAsk.party_name} ` : ""}${formatINR(undoAsk.amount)}` })}
          </span>
          <button type="button" onClick={() => setUndoAsk(null)} className="min-h-10 rounded-xl px-3 font-semibold text-white/80 hover:bg-white/10">
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              const e = undoAsk;
              setUndoAsk(null);
              void undo(e);
            }}
            className="min-h-10 rounded-xl bg-gold-300 px-4 font-bold text-ink-950 active:scale-95"
          >
            {t("undo")}
          </button>
        </div>
      )}

      {bubbleOpen && (
        <VoiceBubble
          micPresses={micPresses}
          onClose={() => setBubbleOpen(false)}
          onSubmit={(text) => {
            setBubbleOpen(false);
            void understand(text);
          }}
          onCommand={(command, partyId) => {
            setBubbleOpen(false);
            runCommand(command, partyId);
          }}
          parties={khata.data ?? []}
          items={items.data ?? []}
        />
      )}

      {card && (
        <EntryCard
          entry={card}
          parties={khata.data ?? []}
          stock={items.data ?? []}
          onItemAdded={bump}
          onClose={() => setCard(null)}
          onSaved={(saved) => {
            setCard(null);
            setCaptureKey((k) => k + 1); // clear the speak box
            setLastSaved(saved);
            refreshAll();
          }}
        />
      )}

      {lastSaved && (
        <div role="status" className="animate-pop fixed inset-x-4 bottom-28 z-50 mx-auto lg:inset-x-auto lg:bottom-8 lg:right-8 lg:mx-0 lg:w-[28rem] flex max-w-md items-center gap-3 rounded-2xl bg-ink-950 px-4 py-3 text-white shadow-2xl">
          <span className="flex-1">{t("savedToast", { x: formatINR(lastSaved.amount) })}</span>
          <button type="button" onClick={() => void undo(lastSaved)} className="min-h-10 rounded-xl bg-gold-300 px-4 font-bold text-ink-950 active:scale-95">
            {t("undo")}
          </button>
        </div>
      )}

      {openParty && (
        <PartySheet
          party={openParty}
          shop={shop.data}
          onClose={closeSheet}
          onPaid={(entry) => {
            setOpenParty(null);
            setLastSaved(entry);
            refreshAll();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="animate-pop fixed inset-x-4 bottom-28 z-50 mx-auto lg:inset-x-auto lg:bottom-8 lg:right-8 lg:mx-0 lg:w-[28rem] max-w-md rounded-2xl bg-ink-950 px-4 py-3 text-white shadow-2xl"
        >
          {toast}
        </div>
      )}
    </main>
    </div>
  );
}

/** One swipeable page on phones (scrolls up and down by itself); one block of the columns on desktop. */
function Page({ id, children }: { id: NavId; children: ReactNode }) {
  return (
    <div
      id={`page-${id}`}
      className="relative flex w-full shrink-0 snap-start snap-always flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-36 pt-1 lg:mb-6 lg:w-auto lg:break-inside-avoid lg:gap-6 lg:overflow-visible lg:p-0"
    >
      {children}
    </div>
  );
}
