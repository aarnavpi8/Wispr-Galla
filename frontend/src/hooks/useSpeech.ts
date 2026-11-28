"use client";

// The in-app mic. Three engines, best first:
//   1. Wispr Flow API (when WISPR_API_KEY is set on the server): record -> 16 kHz WAV -> /api/transcribe
//   2. Native Android speech recognition (inside the Capacitor app, no key)
//   3. The browser's own speech recognition (D6 option A, no key)
// Wispr Flow as a desktop app still works too: it simply types into the text box.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { postJSON } from "@/lib/api";
import { isNativeApp, joinSpeech, nativeListen, nativeSpeechAvailable } from "@/lib/native";
import { blobToWav16k, canRecord, MAX_SECONDS, toBase64, wisprLanguages } from "@/lib/recorder";

interface RecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechEngine = "wispr" | "native" | "browser" | null;
export type SpeechErrorKey = "micNoSpeech" | "micDenied" | "micFailed" | "wisprFailed";

/** Which engine this device/server can use right now. */
export function pickEngine(wispr: boolean): SpeechEngine {
  if (typeof window === "undefined") return null;
  if (wispr && canRecord()) return "wispr";
  if (isNativeApp()) return nativeSpeechAvailable() ? "native" : null;
  return getCtor() ? "browser" : null;
}

const noop = () => () => {};

export function useSpeech(onText: (text: string) => void, lang = "hi-IN", wispr = false) {
  // null on the server and during hydration, the real engine after.
  const engine = useSyncExternalStore(noop, () => pickEngine(wispr), () => null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // A dictionary key, so the message shows in the chosen language.
  const [error, setError] = useState<SpeechErrorKey | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const cb = useRef(onText);

  useEffect(() => {
    cb.current = onText;
  }, [onText]);

  const stop = useCallback(() => stopRef.current?.(), []);

  const startWispr = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("micDenied");
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const timer = window.setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000);
    rec.onstop = async () => {
      window.clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      const blob = new Blob(chunks, { type: rec.mimeType });
      if (blob.size < 2000) {
        setError("micNoSpeech");
        return;
      }
      setTranscribing(true);
      try {
        const wav = await blobToWav16k(blob);
        const out = await postJSON<{ text: string }>("/api/transcribe", {
          audio: toBase64(wav),
          language: wisprLanguages(lang),
        });
        if (out.text) cb.current(out.text);
        else setError("micNoSpeech");
      } catch {
        setError("wisprFailed");
      } finally {
        setTranscribing(false);
      }
    };
    stopRef.current = () => rec.state === "recording" && rec.stop();
    rec.start();
    setListening(true);
  }, [lang]);

  // Browser speech: keeps listening through pauses until stop is tapped (the browser ends a
  // session after a silence; we start a new one and keep the words already heard).
  const startBrowser = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    let stopped = false;
    let heard = "";
    let current = "";
    let r: Recognition;
    const cap = window.setTimeout(() => stopRef.current?.(), 5 * 60 * 1000);
    const session = () => {
      r = new Ctor();
      r.lang = lang;
      r.interimResults = true;
      // Chrome on Android repeats earlier words in each result when continuous; there we listen
      // one stretch at a time and restart (same as continuous, without the doubled text).
      r.continuous = !/android/i.test(navigator.userAgent);
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        current = text;
        cb.current(joinSpeech(heard, current));
      };
      r.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return; // a pause: carry on
        stopped = true;
        setError(e.error === "not-allowed" ? "micDenied" : "micFailed");
      };
      r.onend = () => {
        heard = joinSpeech(heard, current);
        current = "";
        if (stopped) {
          window.clearTimeout(cap);
          setListening(false);
          if (!heard) setError("micNoSpeech");
        } else session();
      };
      r.start();
    };
    stopRef.current = () => {
      stopped = true;
      r.stop();
    };
    session();
    setListening(true);
  }, [lang]);

  const startNative = useCallback(async () => {
    setListening(true);
    // A stop tap while the mic is still starting (permission prompt) must not be lost.
    let cancelled = false;
    stopRef.current = () => {
      cancelled = true;
      setListening(false);
    };
    const handle = await nativeListen(lang, (text) => cb.current(text));
    if (!handle.ok) {
      setListening(false);
      setError(handle.error);
      return;
    }
    if (cancelled) {
      void handle.stop();
      return;
    }
    stopRef.current = () => {
      setListening(false); // the button changes back right away
      void handle.stop();
    };
    await handle.done;
    setListening(false);
  }, [lang]);

  const start = useCallback(() => {
    setError(null);
    if (engine === "wispr") void startWispr();
    else if (engine === "native") void startNative();
    else if (engine === "browser") startBrowser();
  }, [engine, startWispr, startNative, startBrowser]);

  useEffect(() => () => stopRef.current?.(), []);

  return { supported: engine !== null, engine, listening, transcribing, error, start, stop };
}
