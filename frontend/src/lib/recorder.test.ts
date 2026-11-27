import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { encodeWav, toBase64, wisprLanguages } from "./recorder";

describe("encodeWav", () => {
  it("writes a 16 kHz mono 16-bit PCM WAV header Wispr Flow accepts", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const v = new DataView(wav);
    const str = (o: number, n: number) => String.fromCharCode(...new Uint8Array(wav, o, n));
    expect(str(0, 4)).toBe("RIFF");
    expect(str(8, 4)).toBe("WAVE");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8); // 4 samples x 2 bytes
    expect(wav.byteLength).toBe(44 + 8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });

  it("clips out-of-range samples instead of wrapping", () => {
    const v = new DataView(encodeWav(new Float32Array([3, -3])));
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
});

describe("toBase64", () => {
  it("matches btoa for small and large buffers", () => {
    const small = new TextEncoder().encode("RIFF").buffer;
    expect(toBase64(small as ArrayBuffer)).toBe(btoa("RIFF"));
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(atob(toBase64(big.buffer)).length).toBe(100_000);
  });
});

describe("wisprLanguages", () => {
  it("hints the chosen language plus English for code-switching", () => {
    expect(wisprLanguages("hi-IN")).toEqual(["hi", "en"]);
    expect(wisprLanguages("mr-IN")).toEqual(["mr", "en"]);
    expect(wisprLanguages("en-IN")).toEqual(["en"]);
  });
});

describe("useSpeech with Wispr Flow", () => {
  it("records, converts to WAV and sends it to /api/transcribe, then fills the text", async () => {
    vi.resetModules();
    vi.doMock("./recorder", async (orig) => {
      const real = await orig<typeof import("./recorder")>();
      return {
        ...real,
        canRecord: () => true,
        blobToWav16k: async () => real.encodeWav(new Float32Array(1600)),
      };
    });
    const stopTrack = vi.fn();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) },
    });
    class FakeRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob([new Uint8Array(5000)]) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const fetchMock = vi.fn(async () => Response.json({ text: "Ramesh ko 200 udhaar", detected_language: "hi", source: "wispr" }));
    vi.stubGlobal("fetch", fetchMock);

    const { useSpeech } = await import("@/hooks/useSpeech");
    const onText = vi.fn();
    const { result } = renderHook(() => useSpeech(onText, "hi-IN", true));
    await waitFor(() => expect(result.current.engine).toBe("wispr"));

    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.listening).toBe(true));
    await act(async () => result.current.stop());

    await waitFor(() => expect(onText).toHaveBeenCalledWith("Ramesh ko 200 udhaar"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/transcribe");
    const body = JSON.parse(String(init.body));
    expect(body.language).toEqual(["hi", "en"]);
    expect(atob(body.audio).slice(0, 4)).toBe("RIFF");
    expect(stopTrack).toHaveBeenCalled(); // mic released
    expect(result.current.transcribing).toBe(false);
    vi.doUnmock("./recorder");
  });
});
