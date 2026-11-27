"use client";

import { useEffect, useState } from "react";

import type { ShopSummary } from "@/lib/types";

// Placeholder home screen: proves web -> api -> database works end to end.
// The real capture -> entry card -> save flow replaces the bottom half.
export default function Home() {
  const [shop, setShop] = useState<ShopSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    fetch("/api/shop")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
        return res.json();
      })
      .then(setShop)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <header className="rounded-2xl bg-green-900 p-4 text-white">
        <p className="text-sm opacity-80">Galla</p>
        <h1 className="text-2xl font-bold">{shop?.name ?? "…"}</h1>
        {shop && (
          <p className="mt-1 text-sm opacity-80">
            {shop.items} items · {shop.customers} grahak · {shop.suppliers} supplier ·{" "}
            {shop.entries} entries
          </p>
        )}
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 p-3 text-money-out">
          {error}
        </p>
      )}

      {shop && !shop.llm_configured && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-pending">
          AI key not set: using the built-in rules to understand entries.
        </p>
      )}

      <label htmlFor="capture" className="text-lg font-semibold">
        Boliye ya likhiye
      </label>
      <textarea
        id="capture"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Sharma ji ne 500 UPI se diye"
        className="w-full rounded-2xl border-2 border-stone-300 bg-white p-4 text-xl focus:border-green-800 focus:outline-none"
      />

      <div className="flex gap-3">
        <button
          type="button"
          disabled
          className="min-h-14 flex-1 rounded-2xl bg-stone-200 text-lg font-semibold text-stone-500"
        >
          🎤 Dabake boliye
        </button>
        <button
          type="button"
          disabled={!text.trim()}
          className="min-h-14 flex-1 rounded-2xl bg-green-800 text-lg font-semibold text-white disabled:opacity-40"
        >
          Aage
        </button>
      </div>
    </main>
  );
}
