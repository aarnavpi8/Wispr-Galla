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

/** Start native speech recognition; `onText` gets the running transcript. */
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
    await SpeechRecognition.addListener("partialResults", (d) => {
      if (d.matches?.[0]) onText(d.matches[0]);
    });
    await SpeechRecognition.addListener("listeningState", (d) => {
      if (d.status === "stopped") finish();
    });
    SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1 }).catch(() => finish());
    return {
      ok: true,
      stop: async () => {
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
