"use client";

import { useCallback, useEffect, useState } from "react";

import { identityHeaders } from "./identity";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store", headers: await identityHeaders() });
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
    headers: { "Content-Type": "application/json", ...(await identityHeaders()) },
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

/**
 * Tiny fetch hook: { data, error, loading, reload, setData }.
 * path null = don't fetch yet; a new `key` (e.g. who is signed in) fetches again.
 */
export function useApi<T>(path: string | null, key?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
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
  }, [path, tick, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: !data && !error, reload, setData };
}
