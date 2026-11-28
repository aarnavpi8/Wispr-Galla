"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSpeech } from "./useSpeech";

// How "BolKhata" comes out of speech recognition, in Roman and Indian scripts, plus near-misses
// ("bol kata", "ball khatta").
const WAKE_WORD = /(bol+|ball)\s*kh?att?a|बोल\s*खाता|બોલ\s*ખાતા|ਬੋਲ\s*ਖਾਤਾ|বোল\s*খাতা/giu;
const PAUSE_MS = 1500; // a pause this long ends what was said after the wake word
const IDLE_MS = 10 * 60 * 1000; // turns itself off after 10 minutes without being used

/** What was said after the last "BolKhata": null if it wasn't said, "" if nothing came after it. */
export function afterWakeWord(text: string): string | null {
  let end = -1;
  for (const m of text.matchAll(WAKE_WORD)) end = m.index + m[0].length;
  return end < 0 ? null : text.slice(end).replace(/^[\s,.!?।]+/, "").trim();
}

/**
 * Hands-free mode, like Alexa: while on, the mic listens for "BolKhata".
 * What is said after it goes to `onHeard` (an entry, a command or a question); "BolKhata" alone
 * calls `onWake`. Listening pauses while `paused` (a card or sheet is open) and the mode turns
 * itself off after 10 idle minutes (`onIdleOff`). The screen is kept awake while it's on.
 *
 * It uses the browser's or the phone's own speech recognition: Wispr records clips, so it can't
 * listen all the time. Works only while the app is open.
 */
export function useHandsFree({
  lang,
  paused,
  onHeard,
  onWake,
  onIdleOff,
}: {
  lang: string;
  paused: boolean;
  onHeard: (text: string) => void;
  onWake: () => void;
  onIdleOff: () => void;
}) {
  const [on, setOn] = useState(false);
  const [lastUse, setLastUse] = useState(0);
  const latest = useRef({ onHeard, onWake, onIdleOff });
  useEffect(() => {
    latest.current = { onHeard, onWake, onIdleOff };
  });

  const pauseTimer = useRef(0);
  const acting = useRef(false); // set once a command is taken, until listening starts again
  const stopListening = useRef(() => {});

  const onText = useCallback((text: string) => {
    window.clearTimeout(pauseTimer.current);
    if (acting.current || afterWakeWord(text) === null) return;
    // Wait for a pause, then act on what was said after the wake word.
    pauseTimer.current = window.setTimeout(() => {
      const said = afterWakeWord(text) ?? "";
      acting.current = true;
      stopListening.current();
      setLastUse(Date.now());
      if (said) latest.current.onHeard(said);
      else window.setTimeout(() => latest.current.onWake(), 400); // let this mic close first
    }, PAUSE_MS);
  }, []);

  const speech = useSpeech(onText, lang, false);
  useEffect(() => {
    stopListening.current = speech.stop;
  }, [speech.stop]);

  // If the mic was refused or failed, the mode counts as off (no retrying forever).
  const { listening, start, stop } = speech;
  const failed = speech.error === "micDenied" || speech.error === "micFailed";
  const active = on && !failed;

  // Listen whenever it's on and nothing is open; stop otherwise. This also starts listening
  // again after each command and after the recognizer's own 5-minute limit.
  useEffect(() => {
    if (active && !paused && !listening) {
      const id = window.setTimeout(() => {
        acting.current = false;
        start();
      }, 600);
      return () => window.clearTimeout(id);
    }
    if ((!active || paused) && listening) stop();
  }, [active, paused, listening, start, stop]);

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
    acting.current = false;
    if (!paused && !listening) start();
  };

  return {
    supported: speech.supported,
    on: active,
    listening: active && listening,
    error: on && failed ? speech.error : null, // why it switched itself off
    toggle,
  };
}
