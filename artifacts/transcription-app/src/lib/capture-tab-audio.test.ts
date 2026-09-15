import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureTabAudio,
  isFirefoxBrowser,
  isGetDisplayMediaCancel,
  tabAudioMissingTrackMessage,
} from "./capture-tab-audio";

describe("capture-tab-audio helpers", () => {
  it("detects Firefox from the UA string", () => {
    expect(isFirefoxBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0")).toBe(true);
    expect(isFirefoxBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36")).toBe(false);
  });

  it("treats picker dismiss as a cancel", () => {
    expect(isGetDisplayMediaCancel({ name: "NotAllowedError" })).toBe(true);
    expect(isGetDisplayMediaCancel({ name: "AbortError" })).toBe(true);
    expect(isGetDisplayMediaCancel({ name: "OverconstrainedError" })).toBe(false);
  });

  it("explains Firefox’s missing tab-audio track", () => {
    expect(tabAudioMissingTrackMessage("Firefox/143.0")).toMatch(/Firefox cannot capture/i);
    expect(tabAudioMissingTrackMessage("Chrome/128.0")).toMatch(/enable sharing audio/i);
  });
});

describe("captureTabAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not stop the video track after capture", async () => {
    const videoStop = vi.fn();
    const audioStop = vi.fn();
    const videoTrack = {
      kind: "video",
      readyState: "live",
      stop: videoStop,
      addEventListener: vi.fn(),
    };
    const audioTrack = {
      kind: "audio",
      readyState: "live",
      stop: audioStop,
      addEventListener: vi.fn(),
    };
    const displayStream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
      getTracks: () => [audioTrack, videoTrack],
    };
    class FakeMediaStream {
      constructor(public tracks: unknown[]) {}
      getAudioTracks() {
        return this.tracks;
      }
      getTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36",
      mediaDevices: {
        getDisplayMedia: vi.fn(async () => displayStream),
      },
    });

    const captured = await captureTabAudio();
    expect(videoStop).not.toHaveBeenCalled();
    expect(captured.audioStream.getAudioTracks()).toHaveLength(1);

    captured.stop();
    expect(videoStop).toHaveBeenCalled();
    expect(audioStop).toHaveBeenCalled();
  });

  it("uses Firefox-safe constraints and explains a missing audio track", async () => {
    const videoStop = vi.fn();
    const audioStop = vi.fn();
    const displayStream = {
      getAudioTracks: () => [],
      getVideoTracks: () => [{ kind: "video", readyState: "live", stop: videoStop }],
      getTracks: () => [
        { kind: "video", readyState: "live", stop: videoStop },
        { kind: "audio", readyState: "ended", stop: audioStop },
      ],
    };
    const getDisplayMedia = vi.fn(async () => displayStream);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
      mediaDevices: { getDisplayMedia },
    });

    await expect(captureTabAudio()).rejects.toThrow(/Firefox cannot capture/i);
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(videoStop).toHaveBeenCalled();
  });
});
