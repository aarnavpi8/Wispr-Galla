"use client";

// The in-app mic. Three engines, best first:
//   1. Wispr Flow API (when WISPR_API_KEY is set on the server): record -> 16 kHz WAV -> /api/transcribe
//   2. Native Android speech recognition (inside the Capacitor app, no key)
//   3. The browser's own speech recognition (D6 option A, no key)
// Wispr Flow as a desktop app still works too: it simply types into the text box.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { postJSON } from "@/lib/api";
import { isNativeApp, nativeListen, nativeSpeechAvailable } from "@/lib/native";
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

  const startBrowser = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      cb.current(text);
    };
    r.onerror = (e) => {
      setError(e.error === "no-speech" ? "micNoSpeech" : e.error === "not-allowed" ? "micDenied" : "micFailed");
    };
    r.onend = () => setListening(false);
    stopRef.current = () => r.stop();
    r.start();
    setListening(true);
  }, [lang]);

  const startNative = useCallback(async () => {
    setListening(true);
    const handle = await nativeListen(lang, (text) => cb.current(text));
    if (!handle.ok) {
      setListening(false);
      setError(handle.error);
      return;
    }
    stopRef.current = () => void handle.stop();
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
