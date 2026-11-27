// Read-aloud (D7 option A): the browser's own speech synthesis, or the native Android voice
// inside the Capacitor app (Android's WebView has no speechSynthesis). No key.
// For people who find reading hard, every help text and tour step can be heard.
//
// Only one thing speaks at a time. Each readAloud() gets a token; the button that started it
// can stop it (when it closes, or is tapped again) without cutting off someone else's speech.

import { nativeSpeak, nativeStopSpeaking, nativeTtsAvailable } from "./native";

let current = 0; // token of whatever is speaking now (0 = nothing)
let onEndCurrent: (() => void) | null = null;

export function canSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return nativeTtsAvailable() || "speechSynthesis" in window;
}

function finish(token: number) {
  if (token !== current) return;
  current = 0;
  const cb = onEndCurrent;
  onEndCurrent = null;
  cb?.();
}

/**
 * Speak `text` in `lang` (BCP-47, e.g. "hi-IN"). Stops anything already speaking.
 * Returns a token for stopSpeaking(); `onEnd` runs when this speech ends or is stopped.
 */
export function readAloud(text: string, lang: string, onEnd?: () => void): number {
  if (!canSpeak()) return 0;
  stopSpeaking();
  const token = ++current > 0 ? current : (current = 1);
  onEndCurrent = onEnd ?? null;
  const clean = text.replace(/[“”"]/g, "");

  if (nativeTtsAvailable()) {
    nativeSpeak(clean, lang)
      .catch(() => {})
      .finally(() => finish(token));
    return token;
  }
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  u.rate = 0.95;
  // Prefer a voice for this exact language, then the same language anywhere.
  const voices = synth.getVoices?.() ?? [];
  const base = lang.split("-")[0];
  u.voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(base)) ?? null;
  u.onend = () => finish(token);
  u.onerror = () => finish(token);
  synth.speak(u);
  return token;
}

/** Stop speaking. With a token, only if that speech is still the one playing. */
export function stopSpeaking(token?: number): void {
  if (token !== undefined && token !== current) return;
  const was = current;
  if (nativeTtsAvailable()) void nativeStopSpeaking();
  else if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (was) finish(was);
}

export function isSpeaking(token: number): boolean {
  return token !== 0 && token === current;
}
