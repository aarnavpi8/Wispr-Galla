"use client";

import { useAuth } from "@/components/auth";
import { Dashboard } from "@/components/Dashboard";
import { DesktopFrame } from "@/components/DesktopFrame";
import { useLang } from "@/components/language";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LoginScreen } from "@/components/LoginScreen";
import { SetupScreen } from "@/components/SetupScreen";
import { useApi } from "@/lib/api";

function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-5">
      <div className="skeleton h-12 w-2/3 rounded-2xl" />
      <div className="skeleton h-64 rounded-[28px]" />
      <div className="skeleton h-48 rounded-[28px]" />
    </main>
  );
}

// First open: pick a language -> sign in (only if Firebase keys are set) -> set up the shop
// (only on a new install) -> the dashboard.
export default function Home() {
  const { status, user } = useAuth();
  const { ready, chosen } = useLang();
  // Ask only once we know who this is; ask again when the account changes (each has its own shop).
  const setup = useApi<{ has_shop: boolean }>(status === "loading" ? null : "/api/setup", `${status}:${user?.uid ?? ""}`);

  if (!ready) return <Loading />;
  if (!chosen) return <LanguagePicker />; // full screen, no desktop side panel
  if (status === "loading") return <Loading />;
  if (status === "signed-out")
    return (
      <DesktopFrame>
        <LoginScreen />
      </DesktopFrame>
    );
  if (setup.error) return <Dashboard />; // backend unreachable: the dashboard shows the error
  if (!setup.data) return <Loading />;
  if (!setup.data.has_shop)
    return (
      <DesktopFrame>
        <SetupScreen onDone={() => setup.setData({ has_shop: true })} />
      </DesktopFrame>
    );
  return <Dashboard />;
}
