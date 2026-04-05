import { getStaticPublicBaseUrl } from "./authEnv.js";
import {
  emailBulletList,
  emailGettingStartedGreeting,
  emailOrderedList,
  emailParagraph,
  emailStandardGreeting,
  emailSubheading,
  emailTrialExpiredInner,
  emailTrialInformationBlock,
  emailTrialReminderInner,
  emailTrialWelcomeInner,
  formatEmailDate,
  renderInterpreterAiEmail,
} from "./email-template.js";
import {
  isResendConfigured,
  RESEND_FROM_NOREPLY,
  RESEND_FROM_ONBOARDING,
  sendEmail,
} from "./resend-mail.js";

/** @deprecated Prefer emailStandardGreeting / firstNameForGreeting for new code. */
export function displayNameForEmail(email: string, explicitName?: string | null): string {
  const t = explicitName?.trim();
  if (t && !t.includes("@")) return t.split(/[\s_.-]+/).filter(Boolean)[0] ?? "there";
  const local = email.split("@")[0]?.split(/[._+-]/)[0]?.trim() ?? "";
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
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

export async function sendEmailVerificationEmail(to: string, token: string): Promise<void> {
  const base = appBaseUrl();
  const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Verify your InterpreterAI email";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Verify your email",
    bodyHtml: [
      emailStandardGreeting(to, null),
      emailParagraph("Welcome to InterpreterAI."),
      emailParagraph("Before accessing your workspace, please verify your email address."),
    ].join(""),
    primaryButton: { href: verifyUrl, label: "Verify Email" },
    noteHtml: `<p style="margin:0 0 8px;">This verification link expires in <strong>24 hours</strong>.</p>
<p style="margin:0;">If you did not create an account, you can ignore this email.</p>`,
  });

  await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

export async function sendPostVerificationWelcomeEmail(
  to: string,
  trialEndsAt: Date,
  explicitName?: string | null,
): Promise<void> {
  const base = appBaseUrl();
  const endStr = formatEmailDate(trialEndsAt);
  const subject = "Welcome to InterpreterAI — Your free trial has started";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Welcome to InterpreterAI",
    bodyHtml: [
      emailStandardGreeting(to, explicitName),
      emailParagraph("Welcome to InterpreterAI."),
      emailTrialInformationBlock(emailTrialWelcomeInner(endStr)),
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

/** After email verify when this address is not eligible for a new trial (e.g. reused email). */
export async function sendAccountVerifiedNoTrialEmail(to: string): Promise<void> {
  const base = appBaseUrl();
  const subject = "Your InterpreterAI email is verified";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Email verified",
    bodyHtml: [
      emailStandardGreeting(to, null),
      emailParagraph("Your email address has been verified. Sign in to open your workspace."),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });

  await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/**
 * ~12 minutes after signup (verified). Not the post-verification welcome email.
 * @param profileDisplayName Optional real display name (e.g. OAuth full name) — first word only; never pass username.
 */
export async function sendGettingStartedEmail(
  to: string,
  profileDisplayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Start your first transcription session";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Start your first transcription session",
    bodyHtml: [
      emailGettingStartedGreeting(profileDisplayName ?? null),
      emailParagraph("You're ready to start your first transcription session."),
      emailSubheading("Steps to begin"),
      emailOrderedList([
        "Open your workspace",
        'Click "Start Session"',
        "Choose your language pair",
        "Select the audio source (Tab Audio or Mic)",
      ]),
      emailSubheading("Tips for best results"),
      emailBulletList([
        "Select the correct language pair before starting",
        'Use "Tab Audio" to capture the caller\u2019s voice during a call',
        'The "Mic" option is mainly for personal dictation or notes and does not capture the caller audio during calls',
        "Use headphones to avoid audio feedback",
      ]),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });

  return sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/** ~48 hours before trial ends. */
export async function sendTrialReminder48hEmail(
  to: string,
  trialEndsAt: Date,
  displayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const endStr = formatEmailDate(trialEndsAt);
  const subject = "Your InterpreterAI trial ends in 2 days";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your trial ends in 2 days",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailTrialInformationBlock(emailTrialReminderInner(endStr)),
      emailParagraph(
        "Upgrade now to continue using real-time transcription and translation during your interpreting sessions.",
      ),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Upgrade Plan" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

/** ~12 hours before trial ends. */
export async function sendTrialReminder12hEmail(
  to: string,
  trialEndsAt: Date,
  displayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const endStr = formatEmailDate(trialEndsAt);
  const subject = "Your trial expires today";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your trial expires today",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailTrialInformationBlock(emailTrialReminderInner(endStr)),
      emailParagraph(
        "Your InterpreterAI free trial ends soon. Upgrade now to keep uninterrupted access.",
      ),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Upgrade Plan" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendTrialExpiredEmail(to: string, displayName?: string | null): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI trial has ended";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your trial has ended",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailTrialInformationBlock(emailTrialExpiredInner()),
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
  const base = appBaseUrl();
  const subject = "Your InterpreterAI subscription is active";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Your subscription is active",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailParagraph("Your subscription has been successfully activated."),
      emailParagraph(`Plan: ${planName}`),
      emailParagraph(`Next billing date: ${nextBillingDate}`),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Manage Billing" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendPaymentReceiptEmail(
  to: string,
  opts: { amountFormatted: string; paidDateFormatted: string; invoiceNumber?: string | null; description?: string | null },
  displayName?: string | null,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI payment receipt";
  const lines = [
    emailParagraph(`Amount paid: ${opts.amountFormatted}`),
    emailParagraph(`Date: ${opts.paidDateFormatted}`),
  ];
  if (opts.invoiceNumber?.trim()) {
    lines.push(emailParagraph(`Invoice: ${opts.invoiceNumber.trim()}`));
  }
  if (opts.description?.trim()) {
    lines.push(emailParagraph(opts.description.trim()));
  }
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Payment received",
    bodyHtml: [emailStandardGreeting(to, displayName), emailParagraph("Thank you — we received your payment."), ...lines].join(
      "",
    ),
    primaryButton: { href: billingUrl(), label: "Manage Billing" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendSubscriptionCanceledEmail(to: string, displayName?: string | null): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI subscription has been canceled";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    heading: "Subscription canceled",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailParagraph("Your InterpreterAI subscription has been canceled."),
      emailParagraph("You can resubscribe anytime from your workspace to restore access."),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Manage Billing" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}
