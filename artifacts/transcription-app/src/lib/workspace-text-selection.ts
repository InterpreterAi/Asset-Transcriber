/** Native partial copy/select in workspace transcript + translation bubbles (all stacks). */

export const WORKSPACE_SELECTABLE_ROOT_CLASS = "workspace-selectable-root";
export const WORKSPACE_SELECTABLE_TEXT_CLASS = "workspace-selectable-text";

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const resumeListeners = new Set<() => void>();
const pauseListeners = new Set<() => void>();

export function markWorkspaceSelectableText(el: HTMLElement): void {
  el.classList.add(WORKSPACE_SELECTABLE_TEXT_CLASS);
}

export function markWorkspaceSelectableRoot(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.add(WORKSPACE_SELECTABLE_ROOT_CLASS);
}

/**
 * Live transcript/translation paints never pause for native text selection.
 * Users can highlight/copy while speech continues word-by-word without batching or DOM stalls.
 */
export function shouldPauseWorkspaceDomPaint(): boolean {
  return false;
}

export function deferWorkspaceDomMutation(mutate: () => void): void {
  mutate();
}

export function runWorkspaceDomMutation(mutate: () => void): void {
  mutate();
}

export function onWorkspaceDomPaintResume(listener: () => void): () => void {
  resumeListeners.add(listener);
  return () => resumeListeners.delete(listener);
}

export function onWorkspaceDomPaintPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => pauseListeners.delete(listener);
}

/** No-op — selection no longer defers DOM paints (see {@link shouldPauseWorkspaceDomPaint}). */
export function installWorkspaceSelectionPaintDeferral(): () => void {
  return () => {};
}

/** @deprecated Use runWorkspaceDomMutation — kept for existing call sites. */
export function runOrDeferPaintWhileSelecting(target: HTMLElement, paint: () => void): void {
  void target;
  runWorkspaceDomMutation(paint);
}

/** Row hover copy — copies full column text; partial copy uses native selection. */
export function createWorkspaceCopyButton(getText: () => string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = "Copy all";
  btn.setAttribute("aria-label", "Copy all");
  btn.className =
    "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0 self-start mt-0.5 p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 focus:outline-none";
  btn.innerHTML = COPY_ICON;
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = getText().trim();
    if (!text || text === "…") return;
    void navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = CHECK_ICON;
      btn.classList.add("text-green-500");
      window.setTimeout(() => {
        btn.innerHTML = COPY_ICON;
        btn.classList.remove("text-green-500");
      }, 1200);
    });
  });
  return btn;
}
