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
    let quickFails = 0; // rounds that died right after starting (mic taken by another app)
    let round = 0; // each start of the recognizer is one round; only the current one may restart
    let roundStart = 0;
    let ending = false;
    const end = () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(cap);
      window.clearInterval(watchdog);
      finish();
    };
    const cap = window.setTimeout(() => void SpeechRecognition.stop().catch(() => {}).finally(end), 5 * 60 * 1000);
    const listen = () => {
      if (stopped) return;
      const r = ++round;
      roundStart = Date.now();
      ending = false;
      SpeechRecognition.start({ language: lang, partialResults: true, popup: false, maxResults: 1 }).catch(() =>
        endRound(r),
      );
    };
    // A round ends after a pause. Android tells us in different ways: a "stopped" event after
    // speech, a rejected start, or (after silence) nothing at all. Whichever comes first ends the
    // round once; then we listen again. Android often sends the last words of a stretch a moment
    // *after* it stops, so wait for them before keeping the text, or they get added twice.
    // After speech ("stopped" event) the next round starts quickly so no words are missed. After a
    // silent round Android still sends a couple of late errors about a second later; starting
    // before they arrive made them end the *new* round, and rounds piled on top of each other.
    const endRound = (r: number, afterSpeech = false) => {
      if (stopped || ending || r !== round) return;
      ending = true;
      quickFails = Date.now() - roundStart < 1500 ? quickFails + 1 : 0;
      if (quickFails >= 5) return end(); // keeps failing at once: give up instead of looping
      window.setTimeout(
        () => {
          if (stopped || r !== round) return;
          heard = joinSpeech(heard, current);
          current = "";
          listen();
        },
        afterSpeech ? 600 : 1500,
      );
    };
    await SpeechRecognition.addListener("partialResults", (d) => {
      if (d.matches?.[0]) {
        current = d.matches[0];
        onText(joinSpeech(heard, current));
      }
    });
    await SpeechRecognition.addListener("listeningState", (d) => {
      if (d.status === "stopped") endRound(round, true);
    });
    // After a silence the plugin sends no event (its error goes to a call that already returned),
    // so check whether the phone is still listening; without this, listening silently died after
    // the first quiet 5 seconds (hands-free never heard "BolKhata").
    // Two "not listening" answers in a row are needed: a late error from the last round can flip
    // the flag for a moment while the new round is starting.
    let quiet = 0;
    const watchdog = window.setInterval(() => {
      if (stopped || ending || Date.now() - roundStart < 1500) return (quiet = 0), undefined;
      const r = round;
      void SpeechRecognition.isListening()
        .then(({ listening }) => {
          if (r !== round) return;
          quiet = listening ? 0 : quiet + 1;
          if (quiet >= 2) {
            quiet = 0;
            endRound(r);
          }
        })
        .catch(() => {});
    }, 1000);
    listen();
    return {
      ok: true,
      // Stop must always end the turn at once. Between two stretches of speech the recognizer
      // isn't running, and Android then never answers stop(), so we don't wait for it.
      stop: async () => {
        stopped = true;
        window.clearTimeout(cap);
        window.clearInterval(watchdog);
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
