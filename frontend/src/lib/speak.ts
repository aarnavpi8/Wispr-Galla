// Read-aloud (D7 option A): the browser's own speech synthesis, or the native Android voice
// inside the Capacitor app (Android's WebView has no speechSynthesis). No key.
// For people who find reading hard, every help text and tour step can be heard.

import { nativeSpeak, nativeStopSpeaking, nativeTtsAvailable } from "./native";

export function canSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return nativeTtsAvailable() || "speechSynthesis" in window;
}

/** Speak `text` in `lang` (BCP-47, e.g. "hi-IN"). Stops anything already speaking. */
export function readAloud(text: string, lang: string): boolean {
  if (!canSpeak()) return false;
  const clean = text.replace(/[“”"]/g, "");
  if (nativeTtsAvailable()) {
    void nativeSpeak(clean, lang).catch(() => {});
    return true;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  u.rate = 0.95;
  // Prefer a voice for this exact language, then the same language anywhere.
  const voices = synth.getVoices();
  const base = lang.split("-")[0];
  u.voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(base)) ?? null;
  synth.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (nativeTtsAvailable()) void nativeStopSpeaking();
  else if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
