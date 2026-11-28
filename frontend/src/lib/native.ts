// Native Android features when the app runs inside the Capacitor shell (see frontend/capacitor.config.ts).
// Android's WebView has no Web Speech API, so the mic and read-aloud use native plugins there.
// In a normal browser every function here is a no-op / returns false.

import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativeSpeechAvailable(): boolean {
  return isNativeApp() && Capacitor.isPluginAvailable("SpeechRecognition");
}

export function nativeTtsAvailable(): boolean {
  return isNativeApp() && Capacitor.isPluginAvailable("TextToSpeech");
}

type ListenHandle =
  | { ok: true; stop: () => Promise<void>; done: Promise<void> }
  | { ok: false; error: "micDenied" | "micFailed" };

/**
 * Join what was already heard with the words of the current stretch of speech.
 * Some recognizers repeat earlier words in a later result; never add text onto itself.
 */
export function joinSpeech(heard: string, current: string): string {
  const h = heard.trim();
  const c = current.trim();
  if (!h) return c;
  if (!c) return h;
  const lh = h.toLowerCase();
  const lc = c.toLowerCase();
  if (lc.startsWith(lh)) return c; // the new result already contains everything so far
  if (lh.endsWith(lc)) return h; // a late repeat of the last words
  return `${h} ${c}`;
}

/**
 * Start native speech recognition; `onText` gets the running transcript.
 * Android ends a recognition session after a short silence. We don't let that end the turn:
 * the words so far are kept and listening starts again, until the shopkeeper taps stop
 * (or 5 minutes pass), so someone who speaks slowly or pauses to think is never cut off.
 */
export async function nativeListen(lang: string, onText: (text: string) => void): Promise<ListenHandle> {
  const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
  try {
    const { available } = await SpeechRecognition.available();
    if (!available) return { ok: false, error: "micFailed" };
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") return { ok: false, error: "micDenied" };

    await SpeechRecognition.removeAllListeners();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    let stopped = false;
    let heard = ""; // words from earlier stretches of speech
    let current = ""; // words of the stretch being heard now
    let failures = 0;
    const end = () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(cap);
      finish();
    };
    const cap = window.setTimeout(() => void SpeechRecognition.stop().catch(() => {}).finally(end), 5 * 60 * 1000);
    const listen = () => {
      if (stopped) return;
      SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1 })
        .then(() => (failures = 0))
        .catch(() => {
          // A pause with nothing said ends with "no match"; just listen again. Give up only if it
          // keeps failing straight away (mic taken by another app).
          if (++failures >= 5) end();
          else window.setTimeout(listen, 300);
        });
    };
    await SpeechRecognition.addListener("partialResults", (d) => {
      if (d.matches?.[0]) {
        current = d.matches[0];
        onText(joinSpeech(heard, current));
      }
    });
    let settling = false;
    await SpeechRecognition.addListener("listeningState", (d) => {
      if (d.status !== "stopped" || stopped || settling) return;
      // The phone stopped after a pause. Android often sends the final words of that stretch a
      // moment *after* saying it stopped; wait for them before keeping the text, or the same
      // words get added twice. Then carry on listening.
      settling = true;
      window.setTimeout(() => {
        heard = joinSpeech(heard, current);
        current = "";
        settling = false;
        listen();
      }, 600);
    });
    listen();
    return {
      ok: true,
      // Stop must always end the turn at once. Between two stretches of speech the recognizer
      // isn't running, and Android then never answers stop(), so we don't wait for it.
      stop: async () => {
        stopped = true;
        window.clearTimeout(cap);
        finish();
        void SpeechRecognition.stop().catch(() => {});
      },
      done: done.finally(() => void SpeechRecognition.removeAllListeners()),
    };
  } catch {
    return { ok: false, error: "micFailed" };
  }
}

export async function nativeSpeak(text: string, lang: string): Promise<void> {
  const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
  await TextToSpeech.stop().catch(() => {});
  await TextToSpeech.speak({ text, lang, rate: 0.95 });
}

export async function nativeStopSpeaking(): Promise<void> {
  const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
  await TextToSpeech.stop().catch(() => {});
}
