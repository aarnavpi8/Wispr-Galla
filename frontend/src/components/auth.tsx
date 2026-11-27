"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { getJSON } from "@/lib/api";
import { setTokenSource } from "@/lib/identity";
import type { AppConfig } from "@/lib/types";

export interface GallaUser {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
}

type Status = "loading" | "signed-in" | "signed-out" | "guest" | "disabled";

interface AuthState {
  status: Status;
  user: GallaUser | null;
  config: AppConfig | null;
  /** Dictionary key of the last sign-in problem (shown in the chosen language). */
  /** Bumps after each successful sign-in (the welcome splash replays). */
  loginCount: number;
  error: "loginFailed" | "domainNotAllowed" | "loginProviderOff" | "loginPopupBlocked" | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const GUEST_KEY = "galla.guest";

function readGuest(): boolean {
  try {
    return sessionStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<GallaUser | null>(null);
  const [error, setError] = useState<AuthState["error"]>(null);
  const [loginCount, setLoginCount] = useState(0);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let live = true;
    getJSON<AppConfig>("/api/config")
      .then(async (cfg) => {
        if (!live) return;
        setConfig(cfg);
        if (!cfg.firebase) {
          // No keys: no login at all, the app just opens.
          setStatus("disabled");
          return;
        }
        const { watchUser } = await import("@/lib/firebase");
        unsub = await watchUser(cfg.firebase, (u) => {
          if (!live) return;
          if (u) {
            // Every API call now carries this account's token, so the server shows its own shop.
            setTokenSource(() => u.getIdToken());
            setUser({ uid: u.uid, name: u.displayName ?? "Dukaandaar", email: u.email, photoURL: u.photoURL });
            setStatus("signed-in");
          } else {
            setTokenSource(null);
            setUser(null);
            setStatus(readGuest() ? "guest" : "signed-out");
          }
        });
      })
      .catch(() => {
        // Backend down: let the app open; its own screens show the error.
        if (live) setStatus("disabled");
      });
    return () => {
      live = false;
      unsub?.();
    };
  }, []);

  const signIn = useCallback(async () => {
    if (!config?.firebase) return;
    setError(null);
    try {
      const { signInWithGoogle } = await import("@/lib/firebase");
      await signInWithGoogle(config.firebase);
      setLoginCount((n) => n + 1);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      console.warn("Google sign-in failed:", code || e);
      if (code === "auth/unauthorized-domain") setError("domainNotAllowed");
      else if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") setError("loginProviderOff");
      else if (code === "auth/popup-blocked") setError("loginPopupBlocked");
      else setError("loginFailed");
    }
  }, [config]);

  const signOut = useCallback(async () => {
    if (!config?.firebase) return;
    const { signOutUser } = await import("@/lib/firebase");
    try {
      sessionStorage.removeItem(GUEST_KEY);
    } catch {
      // Storage blocked; nothing to clear.
    }
    await signOutUser(config.firebase);
  }, [config]);

  const continueAsGuest = useCallback(() => {
    try {
      sessionStorage.setItem(GUEST_KEY, "1");
    } catch {
      // Storage blocked: guest mode lasts until reload.
    }
    setStatus("guest");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, config, error, loginCount, signIn, signOut, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Server config (which optional keys are set), or null outside the provider / before it loads. */
export function useAppConfig(): AppConfig | null {
  return useContext(AuthContext)?.config ?? null;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function GoogleIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
