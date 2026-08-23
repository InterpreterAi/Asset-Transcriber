import type { Reel } from "@/hooks/use-reels";
import { downloadBlob, downloadUrlAsFile } from "@/lib/downloadBlob";
import { getReelMp4, hasReelMp4 } from "@/lib/reelMp4Cache";

export async function downloadLibraryReel(reel: Reel): Promise<void> {
  if (reel.downloadUrl) {
    await downloadUrlAsFile(
      reel.downloadUrl,
      reel.downloadFilename || "InterpreterAI-reel.mp4",
    );
    return;
  }

  const cached = await getReelMp4(reel.id);
  if (cached?.blob) {
    downloadBlob(
      cached.blob,
      cached.filename || reel.downloadFilename || "InterpreterAI_reel.mp4",
    );
    return;
  }

  throw new Error(
    "No MP4 saved yet — open in Studio, preview the reel, and click Download MP4.",
  );
}

export async function libraryReelHasMp4(reel: Reel): Promise<boolean> {
  if (reel.downloadUrl) return true;
  if (reel.mp4Cached) return true;
  return hasReelMp4(reel.id);
}

export function libraryReelCanDownload(reel: Reel): boolean {
  return Boolean(reel.downloadUrl || reel.mp4Cached || reel.generated || reel.studioDraft);
}
