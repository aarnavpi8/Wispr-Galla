"use client";

import { useAuth } from "@/components/auth";
import { Dashboard } from "@/components/Dashboard";
import { useLang } from "@/components/language";
import { LanguagePicker } from "@/components/LanguagePicker";
import { LoginScreen } from "@/components/LoginScreen";

function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-5">
      <div className="skeleton h-12 w-2/3 rounded-2xl" />
      <div className="skeleton h-64 rounded-[28px]" />
      <div className="skeleton h-48 rounded-[28px]" />
    </main>
  );
}

// First open: pick a language. Then login (only if Firebase keys are set), then the dashboard.
// Without Firebase keys (judges' path) login is "disabled" and the dashboard opens directly.
export default function Home() {
  const { status } = useAuth();
  const { ready, chosen } = useLang();

  if (!ready) return <Loading />;
  if (!chosen) return <LanguagePicker />;
  if (status === "loading") return <Loading />;
  if (status === "signed-out") return <LoginScreen />;
  return <Dashboard />;
}
