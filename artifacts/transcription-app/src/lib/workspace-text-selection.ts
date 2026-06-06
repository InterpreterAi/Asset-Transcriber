/** Native partial copy/select in workspace transcript + translation bubbles (all stacks). */

export const WORKSPACE_SELECTABLE_ROOT_CLASS = "workspace-selectable-root";
export const WORKSPACE_SELECTABLE_TEXT_CLASS = "workspace-selectable-text";

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const deferredDomMutations: Array<() => void> = [];
const resumeListeners = new Set<() => void>();
const pauseListeners = new Set<() => void>();

let guardInstalled = false;
let pointerSelecting = false;
let activeTextSelection = false;
let resumeCooldownUntil = 0;

export function markWorkspaceSelectableText(el: HTMLElement): void {
  el.classList.add(WORKSPACE_SELECTABLE_TEXT_CLASS);
}

export function markWorkspaceSelectableRoot(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.add(WORKSPACE_SELECTABLE_ROOT_CLASS);
}

function selectionTouchesWorkspace(sel: Selection): boolean {
  if (sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !!el?.closest(`.${WORKSPACE_SELECTABLE_ROOT_CLASS}`);
}

function isInteractiveWorkspaceTarget(el: HTMLElement): boolean {
  return !!el.closest("button,a,input,textarea,select,[role='button'],[contenteditable='true']");
}

/** Pointer on transcript/translation text only — not empty panel chrome or scroll gutters. */
function isWorkspacePointerTarget(el: HTMLElement): boolean {
  if (isInteractiveWorkspaceTarget(el)) return false;
  return !!el.closest(`.${WORKSPACE_SELECTABLE_TEXT_CLASS}`);
}

function syncActiveTextSelectionFromDocument(): void {
  const sel = document.getSelection();
  activeTextSelection = !!(
    sel &&
    !sel.isCollapsed &&
    selectionTouchesWorkspace(sel)
  );
}

function notifyDomPaintPause(): void {
  for (const listener of pauseListeners) {
    try {
      listener();
    } catch {
      /* pause */
    }
  }
}

/** True while the user is dragging a selection or briefly after — freeze live DOM paints. */
export function shouldPauseWorkspaceDomPaint(): boolean {
  if (pointerSelecting || activeTextSelection) return true;
  return Date.now() < resumeCooldownUntil;
}

export function deferWorkspaceDomMutation(mutate: () => void): void {
  deferredDomMutations.push(mutate);
}

export function runWorkspaceDomMutation(mutate: () => void): void {
  if (shouldPauseWorkspaceDomPaint()) {
    deferWorkspaceDomMutation(mutate);
    return;
  }
  mutate();
}

function drainDeferredDomMutations(): void {
  if (shouldPauseWorkspaceDomPaint()) return;
  const queue = deferredDomMutations.splice(0);
  for (const mutate of queue) {
    try {
      mutate();
    } catch {
      /* paint */
    }
  }
  for (const listener of resumeListeners) {
    try {
      listener();
    } catch {
      /* resume */
    }
  }
}

function endPointerInteraction(): void {
  if (!pointerSelecting) return;
  pointerSelecting = false;
  resumeCooldownUntil = Date.now() + 200;
  syncActiveTextSelectionFromDocument();
  window.requestAnimationFrame(() => {
    if (shouldPauseWorkspaceDomPaint()) return;
    drainDeferredDomMutations();
  });
}

export function onWorkspaceDomPaintResume(listener: () => void): () => void {
  resumeListeners.add(listener);
  return () => resumeListeners.delete(listener);
}

export function onWorkspaceDomPaintPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => pauseListeners.delete(listener);
}

export function installWorkspaceSelectionPaintDeferral(): () => void {
  if (guardInstalled) return () => {};
  guardInstalled = true;

  const beginPointerPause = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    if (!isWorkspacePointerTarget(target)) return;
    pointerSelecting = true;
    notifyDomPaintPause();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    beginPointerPause(e.target);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    beginPointerPause(e.target);
  };

  const onPointerUp = () => {
    endPointerInteraction();
  };

  const onSelectionChange = () => {
    syncActiveTextSelectionFromDocument();
    if (shouldPauseWorkspaceDomPaint()) return;
    drainDeferredDomMutations();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("mouseup", onPointerUp, true);
  document.addEventListener("selectionchange", onSelectionChange);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
    document.removeEventListener("mouseup", onPointerUp, true);
    document.removeEventListener("selectionchange", onSelectionChange);
    deferredDomMutations.length = 0;
    resumeListeners.clear();
    pauseListeners.clear();
    pointerSelecting = false;
    activeTextSelection = false;
    guardInstalled = false;
  };
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
