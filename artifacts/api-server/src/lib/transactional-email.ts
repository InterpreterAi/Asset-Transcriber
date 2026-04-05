import { getStaticPublicBaseUrl } from "./authEnv.js";
import {
  emailBulletList,
  emailGreeting,
  emailOrderedList,
  emailParagraph,
  emailSubheading,
  formatEmailDate,
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

function appBaseUrl(): string {
  return getStaticPublicBaseUrl().replace(/\/+$/, "");
}

function workspaceUrl(): string {
  return `${appBaseUrl()}/workspace`;
}

function billingUrl(): string {
  return `${appBaseUrl()}/workspace`;
}

/**
 * Email signup — verify address (24h link). Does not send welcome; that runs after verification.
 */
export async function sendEmailVerificationEmail(to: string, token: string): Promise<void> {
  const base = appBaseUrl();
  const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Verify your email to activate InterpreterAI";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Verify your email",
    bodyHtml: [
      emailParagraph("Welcome to InterpreterAI."),
      emailParagraph("Before accessing your workspace, please verify your email address."),
    ].join(""),
    primaryButton: { href: verifyUrl, label: "Verify Email" },
    noteHtml: `<p style="margin:0 0 8px;">This verification link expires in <strong>24 hours</strong>.</p>
<p style="margin:0;">If you did not create an account, you can ignore this email.</p>`,
  });

  await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/**
 * After email is verified, or immediately for Google OAuth signups — welcome + trial dates.
 */
export async function sendPostVerificationWelcomeEmail(
  to: string,
  trialEndsAt: Date,
  explicitName?: string | null,
): Promise<void> {
  const base = appBaseUrl();
  const name = displayNameForEmail(to, explicitName);
  const endStr = formatEmailDate(trialEndsAt);
  const subject = "Welcome to InterpreterAI";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Welcome to InterpreterAI",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph("Welcome to InterpreterAI."),
      emailParagraph("Your free trial has started."),
      emailSubheading("Trial information"),
      emailParagraph("Your free trial ends on:"),
      emailParagraph(endStr),
      emailParagraph("You can now start using real-time transcription and translation."),
      emailSubheading("Get started in 3 steps"),
      emailOrderedList([
        "Open your workspace",
        "Start a transcription session",
        "Enable real-time translation",
      ]),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });

  await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/** ~12 minutes after signup (job), once per user. */
export async function sendGettingStartedEmail(to: string, explicitName?: string | null): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const name = displayNameForEmail(to, explicitName);
  const subject = "Start your first transcription session";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Start your first transcription session",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph("You can start using InterpreterAI in less than a minute."),
      emailSubheading("Steps to begin"),
      emailOrderedList([
        "Open your workspace",
        'Click "Start Session"',
        "Begin speaking to see live transcription",
      ]),
      emailSubheading("Tips for interpreters"),
      emailBulletList([
        "Use headphones for better audio clarity",
        "Speak clearly for highest transcription accuracy",
        "Switch languages anytime during a session",
      ]),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });

  return sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/**
 * Within 48 hours of trial end — scheduled job.
 */
export async function sendTrialReminderEmail(
  to: string,
  trialEndsAt: Date,
  displayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const base = appBaseUrl();
  const endStr = formatEmailDate(trialEndsAt);
  const subject = "Your InterpreterAI trial ends soon";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your trial ends soon",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph("Your free trial will end on:"),
      emailParagraph(endStr),
      emailParagraph(
        "Upgrade now to continue using real-time transcription and translation during your interpreting sessions.",
      ),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Upgrade Plan" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendTrialExpiredEmail(to: string, displayName?: string | null): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const base = appBaseUrl();
  const subject = "Your InterpreterAI trial has ended";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your trial has ended",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph("Your free trial has expired."),
      emailParagraph(
        "To continue using InterpreterAI for real-time transcription and translation, please upgrade your plan.",
      ),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Reactivate Account" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendSubscriptionConfirmationEmail(
  to: string,
  planName: string,
  nextBillingDate: string,
  displayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const name = displayNameForEmail(to, displayName);
  const base = appBaseUrl();
  const subject = "Your InterpreterAI subscription is active";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your subscription is active",
    bodyHtml: [
      emailGreeting(name),
      emailParagraph("Your subscription has been successfully activated."),
      emailParagraph(`Plan: ${planName}`),
      emailParagraph(`Next billing date: ${nextBillingDate}`),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Manage Billing" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}
