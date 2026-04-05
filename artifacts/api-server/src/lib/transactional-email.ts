import { getStaticPublicBaseUrl } from "./authEnv.js";
import {
  emailGreeting,
  emailParagraph,
  renderInterpreterAiEmail,
} from "./email-template.js";
import {
  isResendConfigured,
  RESEND_FROM_NOREPLY,
  RESEND_FROM_ONBOARDING,
  sendEmail,
} from "./resend-mail.js";

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
  const html = renderInterpreterAiEmail({
    heading: "Welcome to InterpreterAI",
    bodyHtml: [
      emailParagraph("Welcome to InterpreterAI."),
      emailParagraph("Your free trial has started."),
      emailParagraph("Open your workspace below to start using real-time transcription and translation."),
    ].join(""),
    button: { href: NEW_USER_WORKSPACE_URL, label: "Open workspace" },
  });

  await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/**
 * Trial ends in 2 days — scheduled job only.
 */
export async function sendTrialReminderEmail(to: string, displayName?: string | null): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const url = appUrl();
  const subject = "Your InterpreterAI trial ends soon";
  const html = renderInterpreterAiEmail({
    heading: "Your trial ends in 2 days",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph(
        "Your InterpreterAI trial will end in 2 days. To keep using real-time transcription and translation, you can upgrade anytime.",
      ),
      emailParagraph("Plans start at $39/month."),
    ].join(""),
    button: { href: url, label: "View your account" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
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
  const url = appUrl();
  const subject = "Your InterpreterAI subscription is active";
  const html = renderInterpreterAiEmail({
    heading: "Subscription active",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph("Your InterpreterAI subscription is now active."),
      emailParagraph("You have full access to your plan features. Thank you for supporting InterpreterAI."),
    ].join(""),
    button: { href: url, label: "Open InterpreterAI" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}
