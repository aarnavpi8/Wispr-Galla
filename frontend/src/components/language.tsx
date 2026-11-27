"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import { type Lang, LANGS, type StringKey, translate } from "@/lib/i18n";

const KEY = "galla.lang";
const listeners = new Set<() => void>();
let memory: Lang | null = null; // fallback when storage is blocked

function read(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.some((l) => l.code === v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Storage blocked: the choice lasts until reload.
    memory = lang;
  }
  listeners.forEach((l) => l());
}


interface LangState {
  /** null until the shopkeeper has chosen (first open). */
  chosen: Lang | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  ready: boolean;
}

// Default for tests and components rendered without the provider: Hinglish.
const LangContext = createContext<LangState>({
  chosen: "hinglish",
  lang: "hinglish",
  setLang: () => {},
  t: (key, vars) => translate("hinglish", key, vars),
  ready: true,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // "unset" on the server so the first client render matches; real value after hydration.
  const stored = useSyncExternalStore(
    subscribe,
    () => read() ?? memory ?? "none",
    () => "unset",
  );
  const ready = stored !== "unset";
  const chosen = ready && stored !== "none" ? (stored as Lang) : null;
  const lang = chosen ?? "hinglish";

  const setLang = useCallback((l: Lang) => saveLang(l), []);

  // Screen readers and the browser's own text-to-speech read the page in this language.
  useEffect(() => {
    document.documentElement.lang = lang === "hinglish" ? "hi-Latn" : `${lang}-IN`;
  }, [lang]);
  const value = useMemo<LangState>(
    () => ({ chosen, lang, setLang, ready, t: (key, vars) => translate(lang, key, vars) }),
    [chosen, lang, setLang, ready],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangState {
  return useContext(LangContext);
}
