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

/** Join what was already heard with the words of the current stretch of speech. */
export function joinSpeech(heard: string, current: string): string {
  return [heard, current].map((s) => s.trim()).filter(Boolean).join(" ");
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
    await SpeechRecognition.addListener("listeningState", (d) => {
      if (d.status !== "stopped" || stopped) return;
      // The phone stopped after a pause: keep what was said and carry on listening.
      heard = joinSpeech(heard, current);
      current = "";
      window.setTimeout(listen, 250);
    });
    listen();
    return {
      ok: true,
      stop: async () => {
        stopped = true;
        window.clearTimeout(cap);
        await SpeechRecognition.stop().catch(() => {});
        finish();
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
