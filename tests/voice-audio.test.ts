import { describe, expect, it } from "vitest";
import {
  VOICE_MAX_SECONDS,
  cleanTranscript,
  downmixToMono,
  formatCountdown,
  isVoiceSupported,
  levelOf,
} from "@/lib/voice/audio";

/**
 * The parts of voice input that are arithmetic and text rather than a
 * microphone — `src/lib/voice/audio.ts`. The recording and the model are a
 * browser's, and this suite is node-only by design; what is assertable is what
 * the component does with their output.
 */

describe("cleanTranscript", () => {
  it("removes Whisper's non-speech annotations rather than pasting them in", () => {
    expect(cleanTranscript("[BLANK_AUDIO]")).toBe("");
    expect(cleanTranscript(" [Music] Somebody was in the shed (wind blowing) last night ")).toBe(
      "Somebody was in the shed last night",
    );
    expect(cleanTranscript("A car alarm went off [inaudible] twice")).toBe(
      "A car alarm went off twice",
    );
  });

  it("keeps ordinary words in brackets that are part of the report", () => {
    // A parenthetical with a number or punctuation in it is the resident's,
    // not an annotation.
    expect(cleanTranscript("The van (a white one, 2019) parked up")).toBe(
      "The van (a white one, 2019) parked up",
    );
  });

  it("collapses whitespace and trims", () => {
    expect(cleanTranscript("  Two   men\n\non Mill Lane  ")).toBe("Two men on Mill Lane");
  });
});

describe("downmixToMono", () => {
  it("returns one channel unchanged", () => {
    const channel = new Float32Array([0.1, -0.2, 0.3]);
    expect(downmixToMono([channel])).toBe(channel);
  });

  it("averages two channels sample by sample", () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 0, 1]);
    expect(Array.from(downmixToMono([left, right]))).toEqual([0.5, 0, 0]);
  });

  it("is empty for no channels and stops at the shortest", () => {
    expect(downmixToMono([]).length).toBe(0);
    expect(downmixToMono([new Float32Array(4), new Float32Array(3)]).length).toBe(3);
  });
});

describe("formatCountdown", () => {
  it("reads as minutes and seconds, rounding up and never negative", () => {
    expect(formatCountdown(VOICE_MAX_SECONDS)).toBe("1:30");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0.2)).toBe("0:01");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("levelOf", () => {
  it("is zero for silence and capped at one", () => {
    expect(levelOf(new Float32Array(16))).toBe(0);
    expect(levelOf(new Float32Array(16).fill(1))).toBe(1);
    expect(levelOf([])).toBe(0);
  });
});

describe("isVoiceSupported", () => {
  const full = {
    mediaDevices: { getUserMedia: () => undefined },
    MediaRecorder: class {},
    Worker: class {},
    WebAssembly: {},
    AudioContext: class {},
  };

  it("needs every feature, and offers no button without any one of them", () => {
    expect(isVoiceSupported(full)).toBe(true);
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      expect(isVoiceSupported({ ...full, [key]: undefined })).toBe(false);
    }
    expect(isVoiceSupported({ ...full, mediaDevices: {} })).toBe(false);
  });
});
