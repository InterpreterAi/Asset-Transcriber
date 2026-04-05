import { getStaticPublicBaseUrl } from "./authEnv.js";
import { logger } from "./logger.js";
import { isResendConfigured, sendEmail } from "./resend-mail.js";

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

function appUrl(): string {
  return getStaticPublicBaseUrl();
}

const NEW_USER_WORKSPACE_URL = "https://asset-transcriber-production.up.railway.app/workspace";

/**
 * New account (email signup or Google) — welcome + trial notice. Fire-and-forget from auth; errors are logged only.
 */
export async function sendNewAccountWelcomeEmail(to: string): Promise<void> {
  const subject = "Welcome to InterpreterAI";
  const workspaceUrl = escapeHtml(NEW_USER_WORKSPACE_URL);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#333;">
<p>Welcome to InterpreterAI.</p>
<p>Your free trial has started.</p>
<p>You can access the app here:<br><a href="${workspaceUrl}">${workspaceUrl}</a></p>
</body></html>`;

  await sendEmail({ to, subject, html });
}

/**
 * Trial ends in 2 days — scheduled job only.
 */
export async function sendTrialReminderEmail(to: string, displayName?: string | null): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const url = appUrl();
  const subject = "Your InterpreterAI trial ends soon";
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

  return sendEmail({ to, subject, html });
}

/**
 * Subscription active — prepared for future Stripe webhook; not called yet.
 */
export async function sendSubscriptionConfirmationEmail(
  to: string,
  displayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const subject = "Your InterpreterAI subscription is active";
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#333;line-height:1.6;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your InterpreterAI subscription is now active.</p>
  <p>You now have full access to your plan features.</p>
  <p>Thank you for supporting InterpreterAI.</p>
  <p>— InterpreterAI</p>
</body></html>`;

  return sendEmail({ to, subject, html });
}
