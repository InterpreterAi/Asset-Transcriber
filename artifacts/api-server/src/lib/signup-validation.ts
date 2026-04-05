/** Strict signup email: must have local@domain.tld with plausible segments. */
export function isValidSignupEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  if (!email || email.includes(" ") || email.includes("..")) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || !domain.includes(".")) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.some((l) => !l || l.startsWith("-") || l.endsWith("-"))) return false;
  const tld = labels[labels.length - 1] ?? "";
  if (tld.length < 2 || !/^[a-z]{2,63}$/i.test(tld)) return false;
  if (!/^[a-z0-9._%+-]+$/i.test(local)) return false;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return false;
  return true;
}

export const SIGNUP_EMAIL_INVALID = "Please enter a valid email address.";

export function validateSignupPassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters and include at least one letter and one number.";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must be at least 8 characters and include at least one letter and one number.";
  }
  return null;
}

const DISPOSABLE_DOMAINS = new Set(
  [
    "mailinator.com",
    "mailinator2.com",
    "guerrillamail.com",
    "guerrillamailblock.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamail.biz",
    "sharklasers.com",
    "grr.la",
    "10minutemail.com",
    "10minutemail.net",
    "10minutemail.org",
    "tempmail.com",
    "tempmail.net",
    "tempmail.org",
    "temp-mail.org",
    "temp-mail.io",
    "throwaway.email",
    "trashmail.com",
    "yopmail.com",
    "yopmail.fr",
    "getnada.com",
    "dispostable.com",
    "maildrop.cc",
    "mailnesia.com",
    "fakeinbox.com",
    "mintemail.com",
    "emailondeck.com",
    "moakt.com",
    "spamgourmet.com",
  ].map((d) => d.toLowerCase()),
);

export function isDisposableEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const sub = parts.slice(i).join(".");
    if (DISPOSABLE_DOMAINS.has(sub)) return true;
  }
  return false;
}

export const SIGNUP_DISPOSABLE_EMAIL = "Temporary email addresses are not allowed.";
