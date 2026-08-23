/** Trigger a file download from a Blob (works for large MP4s). */
export function downloadBlob(blob: Blob, filename: string): void {
  const safeName = filename.trim() || "InterpreterAI_reel.mp4";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** Fetch same-origin URL and download as file. */
export async function downloadUrlAsFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  downloadBlob(blob, filename);
}
