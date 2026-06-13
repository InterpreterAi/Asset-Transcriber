/** Safe internal path after login — blocks open redirects and auth loops. */
export function sanitizePostLoginPath(next: string | null | undefined): string {
  if (!next) return "/workspace";
  try {
    const decoded = decodeURIComponent(next.trim());
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/workspace";
    if (decoded.startsWith("/login") || decoded.startsWith("/signup")) return "/workspace";
    return decoded;
  } catch {
    return "/workspace";
  }
}

export function postLoginDestination(search?: string): string {
  const raw =
    search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const next = new URLSearchParams(raw).get("next");
  return sanitizePostLoginPath(next);
}

/** Login URL that returns the user to the current page (or an explicit path) after auth. */
export function loginUrlForReturnTo(explicitReturnTo?: string): string {
  let path = explicitReturnTo;
  if (!path && typeof window !== "undefined") {
    path = window.location.pathname + window.location.search;
  }
  path = path || "/workspace";
  return `/login?next=${encodeURIComponent(path)}`;
}
