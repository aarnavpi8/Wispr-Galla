// Read-aloud (D7 option A): the browser's own speech synthesis. No key, works offline on
// most phones. For people who find reading hard, every help text and tour step can be heard.

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speak `text` in `lang` (BCP-47, e.g. "hi-IN"). Stops anything already speaking. */
export function readAloud(text: string, lang: string): boolean {
  if (!canSpeak()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[“”"]/g, ""));
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
  if (canSpeak()) window.speechSynthesis.cancel();
}
