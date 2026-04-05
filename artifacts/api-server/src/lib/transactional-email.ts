import { getStaticPublicBaseUrl } from "./authEnv.js";
import { sendWelcomeEmail } from "./email.js";
import { logger } from "./logger.js";
import { isSmtpConfigured, sendSmtpMail } from "./smtp-mail.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Friendly greeting from email local-part or explicit OAuth name. */
export function displayNameForEmail(email: string, explicitName?: string | null): string {
  const t = explicitName?.trim();
  if (t) return t;
  const local = email.split("@")[0]?.replace(/[._+-]+/g, " ").trim() ?? "";
  if (!local) return "there";
  return local
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatTrialEndDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function appUrl(): string {
  return getStaticPublicBaseUrl();
}

/**
 * 1) Free trial started — new account (email or Google).
 * Uses Gmail SMTP when configured; otherwise falls back to legacy Resend welcome.
 */
export async function sendFreeTrialStartedEmail(
  to: string,
  opts: { trialEndsAt: Date; displayName?: string | null },
): Promise<void> {
  const name = displayNameForEmail(to, opts.displayName);
  const end = formatTrialEndDate(opts.trialEndsAt);
  const url = appUrl();

  if (!isSmtpConfigured()) {
    void sendWelcomeEmail(to);
    return;
  }

  const subject = "Your InterpreterAI free trial has started";
  const text = [
    `Hi ${name},`,
    "",
    "Welcome to InterpreterAI.",
    "",
    "Your 14-day free trial has started today.",
    "",
    "Daily usage during the trial:",
    "• Up to 3 hours of real-time interpreting per day",
    "",
    "Trial end date:",
    end,
    "",
    "You can upgrade anytime from your dashboard.",
    "",
    "Start using InterpreterAI:",
    url,
    "",
    "— InterpreterAI",
  ].join("\n");

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#333;line-height:1.6;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Welcome to InterpreterAI.</p>
  <p>Your 14-day free trial has started today.</p>
  <p><strong>Daily usage during the trial:</strong></p>
  <ul>
    <li>Up to 3 hours of real-time interpreting per day</li>
  </ul>
  <p><strong>Trial end date:</strong><br>${escapeHtml(end)}</p>
  <p>You can upgrade anytime from your dashboard.</p>
  <p><a href="${escapeHtml(url)}" style="color:#1d6ae5;">Start using InterpreterAI</a></p>
  <p>— InterpreterAI</p>
</body></html>`;

  const ok = await sendSmtpMail({ to, subject, text, html });
  if (ok) logger.info({ email: to }, "Free trial started email sent (SMTP)");
  else void sendWelcomeEmail(to);
}

/**
 * 2) Trial ends in 2 days — scheduled job only.
 */
export async function sendTrialReminderEmail(to: string, displayName?: string | null): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const url = appUrl();
  const subject = "Your InterpreterAI trial ends soon";
  const text = [
    `Hi ${name},`,
    "",
    "Your InterpreterAI trial will end in 2 days.",
    "",
    "If you'd like to continue using real-time transcription and translation during your calls, you can upgrade anytime.",
    "",
    "Plans start at $39/month.",
    "",
    "Upgrade here:",
    url,
    "",
    "— InterpreterAI",
  ].join("\n");

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#333;line-height:1.6;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your InterpreterAI trial will end in 2 days.</p>
  <p>If you'd like to continue using real-time transcription and translation during your calls, you can upgrade anytime.</p>
  <p>Plans start at $39/month.</p>
  <p><a href="${escapeHtml(url)}" style="color:#1d6ae5;">Upgrade here</a></p>
  <p>— InterpreterAI</p>
</body></html>`;

  return sendSmtpMail({ to, subject, text, html });
}

/**
 * 3) Subscription active — prepared for future Stripe webhook; not called yet.
 */
export async function sendSubscriptionConfirmationEmail(
  to: string,
  displayName?: string | null,
): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const subject = "Your InterpreterAI subscription is active";
  const text = [
    `Hi ${name},`,
    "",
    "Your InterpreterAI subscription is now active.",
    "",
    "You now have full access to your plan features.",
    "",
    "Thank you for supporting InterpreterAI.",
    "",
    "— InterpreterAI",
  ].join("\n");

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#333;line-height:1.6;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your InterpreterAI subscription is now active.</p>
  <p>You now have full access to your plan features.</p>
  <p>Thank you for supporting InterpreterAI.</p>
  <p>— InterpreterAI</p>
</body></html>`;

  return sendSmtpMail({ to, subject, text, html });
}
