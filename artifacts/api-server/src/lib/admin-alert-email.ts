/** Where operator alerts go (support tickets, Security Watch). Set ADMIN_ALERT_EMAIL=off to silence. */
export function adminAlertEmail(): string | null {
  const raw = process.env.ADMIN_ALERT_EMAIL?.trim();
  if (raw && /^(off|none|false|0)$/i.test(raw)) return null;
  return raw || "mohamed.ashraf88@live.com";
}

export function adminAlertTimeZone(): string {
  return process.env.ADMIN_ALERT_TIMEZONE?.trim() || "Africa/Cairo";
}

export function formatAdminAlertTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: adminAlertTimeZone(),
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "shortOffset",
    }).format(date);
  } catch {
    return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  }
}
