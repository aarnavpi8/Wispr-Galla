"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSpeech } from "./useSpeech";

// How "BolKhata" comes out of speech recognition, in Roman and Indian scripts, plus near-misses
// heard on phones ("bol kata", "ball khatta", "bolo khaata", "bol khatha", "bowl khata",
// "bulk hata", "बोलो खाता", "बोल ख़ाता", "बोल खाते"). Android's English recognizer hears it as
// "Kolkata" (checked on a Galaxy A55), so that counts too. Whole words only, so "symbol kit" etc.
// don't wake it.
const WAKE_WORD =
  /\b(?:b[ou]l+[eo]?|ball|bowl)[\s-]*kh?a+t+h?[ae]\b|\bbulk\s*h?a+t+a\b|\bk[ao]l+[ck]?k?h?a+t+a\b|कोलकाता|बोल[ोे]?\s*ख़?ात[ाे]|બોલ[ો]?\s*ખાતા|ਬੋਲ\s*ਖਾਤਾ|বোল\s*খাতা/giu;
const PAUSE_MS = 1500; // a pause this long ends what was said after the wake word
const WAIT_MS = 8000; // after "BolKhata" alone, how long the banner waits for the entry
const IDLE_MS = 10 * 60 * 1000; // turns itself off after 10 minutes without being used

/** What was said after the last "BolKhata": null if it wasn't said, "" if nothing came after it. */
/**
 * "I heard you": a short rising two-note chime and a buzz, the moment the wake word is caught,
 * so the shopkeeper knows to keep talking (like a smart speaker lighting up).
 */
export function wakeFeedback() {
  try {
    navigator.vibrate?.(60);
  } catch {
    // no vibration on this device
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const at = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = at + i * 0.11;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    // no sound: the banner still shows
  }
}

export function afterWakeWord(text: string): string | null {
  let end = -1;
  for (const m of text.matchAll(WAKE_WORD)) end = m.index + m[0].length;
  return end < 0 ? null : text.slice(end).replace(/^[\s,.!?।]+/, "").trim();
}

/**
 * Hands-free mode, like Alexa: while on, the mic listens for "BolKhata".
 * What is said after it goes to `onHeard` (an entry, a command or a question); "BolKhata" alone
 * keeps the "I'm listening" banner up for 8 seconds, waiting for the rest. Listening pauses while `paused` (a card or sheet is open) and the mode turns
 * itself off after 10 idle minutes (`onIdleOff`). The screen is kept awake while it's on.
 *
 * It uses the browser's or the phone's own speech recognition: Wispr records clips, so it can't
 * listen all the time. Works only while the app is open.
 */
export function useHandsFree({
  lang,
  paused,
  onHeard,
  onIdleOff,
}: {
  lang: string;
  paused: boolean;
  onHeard: (text: string) => void;
  onIdleOff: () => void;
}) {
  const [on, setOn] = useState(false);
  const [lastUse, setLastUse] = useState(0);
  const latest = useRef({ onHeard, onIdleOff });
  useEffect(() => {
    latest.current = { onHeard, onIdleOff };
  });

  const pauseTimer = useRef(0);
  // What was said after "BolKhata" so far: null until the wake word is heard. Shown live on screen.
  const [heard, setHeard] = useState<string | null>(null);
  const woken = useRef(false);
  const acting = useRef(false); // set once a command is taken, until listening starts again
  const stopListening = useRef(() => {});

  const onText = useCallback((text: string) => {
    window.clearTimeout(pauseTimer.current);
    const after = acting.current ? null : afterWakeWord(text);
    if (after === null) return;
    // Confirm at once that we're listening, then show the words as they come.
    if (!woken.current) {
      woken.current = true;
      wakeFeedback();
    }
    setHeard(after);
    // Wait for a pause, then act on what was said after the wake word. "BolKhata" alone just keeps
    // the banner up and waits for the entry (no dialog: one clear "I'm listening" signal); if
    // nothing follows, the banner quietly goes away and it listens for "BolKhata" again.
    pauseTimer.current = window.setTimeout(
      () => {
        const said = afterWakeWord(text) ?? "";
        acting.current = true;
        woken.current = false;
        setHeard(null);
        stopListening.current(); // a fresh start, so the old "BolKhata" isn't heard again
        setLastUse(Date.now());
        if (said) latest.current.onHeard(said);
      },
      after ? PAUSE_MS : WAIT_MS,
    );
  }, []);

  const speech = useSpeech(onText, lang, false);
  useEffect(() => {
    stopListening.current = speech.stop;
  }, [speech.stop]);

  // A refused mic turns the mode off. A failed start (the phone's recognizer hiccups when rounds
  // collide) is retried a few times before giving up, instead of switching off at the first one.
  const { listening, start, stop } = speech;
  const hiccups = useRef<number[]>([]); // when each failed start was retried
  const [gaveUp, setGaveUp] = useState(false);
  const failed = speech.error === "micDenied" || gaveUp;
  const active = on && !failed;
  const lastError = speech.error;

  // Listen whenever it's on and nothing is open; stop otherwise. This also starts listening
  // again after each command, after a failed start, and after the recognizer's 5-minute limit.
  useEffect(() => {
    if (active && !paused && !listening) {
      const id = window.setTimeout(() => {
        if (lastError === "micFailed") {
          // Four failures within a minute: the mic is really unavailable (another app has it).
          const now = Date.now();
          hiccups.current = [...hiccups.current.filter((at) => now - at < 60_000), now];
          if (hiccups.current.length >= 4) return setGaveUp(true);
        }
        acting.current = false;
        start();
      }, 600);
      return () => window.clearTimeout(id);
    }
    if ((!active || paused) && listening) stop();
  }, [active, paused, listening, start, stop, lastError]);

  // Turn itself off after 10 minutes without a command.
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      setOn(false);
      latest.current.onIdleOff();
    }, IDLE_MS);
    return () => window.clearTimeout(id);
  }, [active, lastUse]);

  // Keep the screen awake while it's on (the lock is dropped when the app is hidden; take it again).
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | null = null;
    const keepAwake = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    };
    keepAwake();
    document.addEventListener("visibilitychange", keepAwake);
    return () => {
      document.removeEventListener("visibilitychange", keepAwake);
      void lock?.release();
    };
  }, [active]);

  // Turning it on starts the mic from the tap itself (browsers ask for mic permission on a tap).
  const toggle = () => {
    setLastUse(Date.now());
    if (active) {
      setOn(false);
      return;
    }
    setOn(true);
    setGaveUp(false);
    hiccups.current = [];
    acting.current = false;
    if (!paused && !listening) start();
  };

  return {
    supported: speech.supported,
    on: active,
    listening: active && listening,
    heard: active ? heard : null, // words after "BolKhata" while it waits for you to finish
    error: on && failed ? (gaveUp ? "micFailed" : speech.error) : null, // why it switched itself off
    toggle,
  };
}
