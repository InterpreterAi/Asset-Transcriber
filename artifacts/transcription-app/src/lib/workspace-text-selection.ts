/** Native partial copy/select in workspace transcript + translation bubbles (all stacks). */

export const WORKSPACE_SELECTABLE_ROOT_CLASS = "workspace-selectable-root";
export const WORKSPACE_SELECTABLE_TEXT_CLASS = "workspace-selectable-text";

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const pendingPaints = new Map<HTMLElement, () => void>();
let selectionDeferInstalled = false;

export function markWorkspaceSelectableText(el: HTMLElement): void {
  el.classList.add(WORKSPACE_SELECTABLE_TEXT_CLASS);
}

export function markWorkspaceSelectableRoot(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.add(WORKSPACE_SELECTABLE_ROOT_CLASS);
  markWorkspaceSelectableText(el);
}

export function isUserSelectingWithin(target: HTMLElement): boolean {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  return target.contains(range.commonAncestorContainer);
}

/** Skip live DOM repaint while the user is dragging a text selection inside `target`. */
export function runOrDeferPaintWhileSelecting(target: HTMLElement, paint: () => void): void {
  if (!isUserSelectingWithin(target)) {
    paint();
    return;
  }
  pendingPaints.set(target, paint);
}

function drainDeferredPaints(): void {
  const sel = document.getSelection();
  if (sel && !sel.isCollapsed) return;
  for (const [el, paint] of [...pendingPaints.entries()]) {
    if (isUserSelectingWithin(el)) continue;
    pendingPaints.delete(el);
    paint();
  }
}

export function installWorkspaceSelectionPaintDeferral(): () => void {
  if (selectionDeferInstalled) return () => {};
  selectionDeferInstalled = true;

  const onSelectionEnd = () => {
    window.requestAnimationFrame(drainDeferredPaints);
  };
  document.addEventListener("selectionchange", onSelectionEnd);
  document.addEventListener("mouseup", onSelectionEnd);

  return () => {
    document.removeEventListener("selectionchange", onSelectionEnd);
    document.removeEventListener("mouseup", onSelectionEnd);
    pendingPaints.clear();
    selectionDeferInstalled = false;
  };
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
