/**
 * Tab-audio capture via getDisplayMedia.
 *
 * Chrome/Edge can return a tab audio track. Firefox's picker often rejects
 * Chrome-only constraints (`displaySurface`, suppressLocalAudioPlayback, …)
 * so Start appears to do nothing. Firefox also historically returns no audio
 * tracks, and stopping the video track can end audio when it does exist.
 */

export type TabAudioCapture = {
  audioStream: MediaStream;
  displayStream: MediaStream;
  stop: () => void;
};

export function isFirefoxBrowser(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /firefox/i.test(userAgent) && !/seamonkey/i.test(userAgent);
}

export function isGetDisplayMediaCancel(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  return name === "NotAllowedError" || name === "AbortError";
}

export function tabAudioMissingTrackMessage(userAgent?: string): string {
  if (isFirefoxBrowser(userAgent)) {
    return "Firefox cannot capture another tab’s audio. Use Chrome or Edge for Tab Audio, or switch to Microphone.";
  }
  return "No tab audio was captured. Choose a browser tab (not a window) and enable sharing audio, then try again.";
}

const CHROME_TAB_OPTIONS: DisplayMediaStreamOptions = {
  video: {
    displaySurface: "browser",
  } as MediaTrackConstraints,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    suppressLocalAudioPlayback: false,
  } as MediaTrackConstraints,
};

const BASIC_TAB_OPTIONS: DisplayMediaStreamOptions = {
  video: true,
  audio: true,
};

function keepDisplayVideoAlive(displayStream: MediaStream): () => void {
  const videoTracks = displayStream.getVideoTracks();
  if (videoTracks.length === 0 || typeof document === "undefined") return () => {};
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;bottom:0";
  video.srcObject = new MediaStream(videoTracks);
  document.body.appendChild(video);
  void video.play().catch(() => { /* autoplay can fail; tracks still stay live */ });
  return () => {
    video.pause();
    video.srcObject = null;
    video.remove();
  };
}

async function requestDisplayStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Tab audio is not supported in this browser. Use Chrome or Edge, or switch to Microphone.");
  }
  const first = isFirefoxBrowser() ? BASIC_TAB_OPTIONS : CHROME_TAB_OPTIONS;
  try {
    return await navigator.mediaDevices.getDisplayMedia(first);
  } catch (err) {
    if (isGetDisplayMediaCancel(err)) throw err;
    return await navigator.mediaDevices.getDisplayMedia(BASIC_TAB_OPTIONS);
  }
}

export async function captureTabAudio(): Promise<TabAudioCapture> {
  const displayStream = await requestDisplayStream();
  const audioTracks = displayStream.getAudioTracks().filter((t) => t.readyState === "live");
  if (audioTracks.length === 0) {
    displayStream.getTracks().forEach((t) => t.stop());
    throw new Error(tabAudioMissingTrackMessage());
  }

  // Keep the video track running. Stopping it on Firefox (and some Chrome
  // builds) also ends the audio track, so Start appears to capture nothing.
  const releaseVideo = keepDisplayVideoAlive(displayStream);
  const audioStream = new MediaStream(audioTracks);

  const stop = () => {
    releaseVideo();
    displayStream.getTracks().forEach((t) => t.stop());
    audioStream.getTracks().forEach((t) => t.stop());
  };

  return { audioStream, displayStream, stop };
}
