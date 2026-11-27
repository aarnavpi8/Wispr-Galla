"use client";

import { useCallback, useEffect, useState } from "react";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // Body wasn't JSON; keep the status text.
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function patchJSON<T>(path: string, body: unknown): Promise<T> {
  return postJSON<T>(path, body, "PATCH");
}

export async function postJSON<T>(path: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : detail;
    } catch {
      // Body wasn't JSON; keep the status text.
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** Tiny fetch hook: { data, error, loading, reload, setData }. */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    getJSON<T>(path)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: !data && !error, reload, setData };
}
