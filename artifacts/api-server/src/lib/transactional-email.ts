import { getStaticPublicBaseUrl } from "./authEnv.js";
import {
  emailBulletList,
  escapeHtmlAttr,
  formatEmailDate,
  emailGettingStartedGreeting,
  emailOrderedList,
  emailParagraph,
  emailStandardGreeting,
  emailSubheading,
  emailTrialExpiredInner,
  emailTrialInformationBlock,
  emailTrialReminderInner,
  emailTrialWelcomeInner,
  renderInterpreterAiEmail,
} from "./email-template.js";
import {
  isResendConfigured,
  RESEND_FROM_NOREPLY,
  RESEND_FROM_ONBOARDING,
  sendEmail,
  sendEmailWithResult,
  type SendEmailResult,
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

export async function sendEmailVerificationEmail(to: string, token: string, recipientUserId: number): Promise<void> {
  const base = appBaseUrl();
  const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Verify your InterpreterAI email";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
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

  const ok = await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
  if (!ok) {
    throw new Error(
      "Verification email was not delivered (check RESEND_API_KEY and Resend dashboard logs).",
    );
  }
}

export async function sendPostVerificationWelcomeEmail(
  to: string,
  trialEndsAt: Date | string,
  explicitName: string | null | undefined,
  recipientUserId: number,
): Promise<void> {
  const base = appBaseUrl();
  const subject = "Welcome to InterpreterAI — Your free trial has started";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Welcome to InterpreterAI",
    bodyHtml: [
      emailStandardGreeting(to, explicitName),
      emailParagraph("Welcome to InterpreterAI."),
      emailTrialInformationBlock(emailTrialWelcomeInner(trialEndsAt)),
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

  const ok = await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
  if (!ok) {
    throw new Error(
      "Post-verification welcome email was not delivered (check RESEND_API_KEY and Resend dashboard logs).",
    );
  }
}

/** After email verify when this address is not eligible for a new trial (e.g. reused email). */
export async function sendAccountVerifiedNoTrialEmail(to: string, recipientUserId: number): Promise<void> {
  const base = appBaseUrl();
  const subject = "Your InterpreterAI email is verified";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Email verified",
    bodyHtml: [
      emailStandardGreeting(to, null),
      emailParagraph("Your email address has been verified. Sign in to open your workspace."),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });

  const okNoTrial = await sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
  if (!okNoTrial) {
    throw new Error(
      "Account-verified email was not delivered (check RESEND_API_KEY and Resend dashboard logs).",
    );
  }
}

/**
 * ~12 minutes after signup (verified). Not the post-verification welcome email.
 * @param profileDisplayName Optional real display name (e.g. OAuth full name) — first word only; never pass username.
 */
export async function sendGettingStartedEmail(
  to: string,
  profileDisplayName: string | null | undefined,
  recipientUserId: number,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Start your first transcription session";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
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
  trialEndsAt: Date | string,
  displayName: string | null | undefined,
  recipientUserId: number,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI trial ends in 2 days";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Your trial ends in 2 days",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailTrialInformationBlock(emailTrialReminderInner(trialEndsAt)),
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
  trialEndsAt: Date | string,
  displayName: string | null | undefined,
  recipientUserId: number,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your trial expires today";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Your trial expires today",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      emailTrialInformationBlock(emailTrialReminderInner(trialEndsAt)),
      emailParagraph(
        "Your InterpreterAI free trial ends soon. Upgrade now to keep uninterrupted access.",
      ),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Upgrade Plan" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendTrialExpiredEmail(
  to: string,
  displayName: string | null | undefined,
  recipientUserId: number,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI trial has ended";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
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

/** When a metered user hits their daily transcription cap (session stop). At most once per app calendar day. */
export async function sendDailyLimitReachedEmail(
  to: string,
  displayName: string | null | undefined,
  recipientUserId: number,
  opts?: { dailyLimitMinutes?: number; catchUpNotice?: boolean },
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const inviteHref = `${base}/invite`;
  const limit = opts?.dailyLimitMinutes;
  const limitLine =
    Number.isFinite(limit) && Number(limit) > 0
      ? `You've used your full InterpreterAI allowance for today (${Math.round(Number(limit))} minutes).`
      : "You've used your full InterpreterAI allowance for today.";
  const inviteLink = `<p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;"><a href="${escapeHtmlAttr(inviteHref)}" style="color:#5B8CFF;text-decoration:underline;">Refer interpreters (invite link)</a></p>`;
  const subject = "You've reached today's limit — subscribe or refer for more time";
  const catchUp =
    opts?.catchUpNotice === true
      ? emailParagraph(
          "We're sending this now because your account is already at today's limit. After this, you'll receive the same note automatically when a session ends and you've used your full daily allowance.",
        )
      : "";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Daily limit reached",
    bodyHtml: [
      emailStandardGreeting(to, displayName),
      catchUp,
      emailParagraph(limitLine),
      emailParagraph(
        "Your daily minutes reset at the start of the next calendar day (US Eastern time). To get more hours before then, you can subscribe to a paid plan or invite other interpreters.",
      ),
      emailBulletList([
        "Subscribe — choose a plan with a higher daily allowance.",
        "Refer interpreters — your invite link can unlock additional trial time when referrals qualify.",
      ]),
      inviteLink,
      emailParagraph("Thank you for using InterpreterAI."),
    ].join(""),
    primaryButton: { href: billingUrl(), label: "Subscribe or view plans" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

/** One-time campaign: users on an active free trial who have not subscribed (see trial-active-reminder job). */
export async function sendTrialActiveReminderEmail(
  to: string,
  opts?: { userId?: number; trialEndsAt?: Date | string; daysRemaining?: number | null },
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Reminder: Your InterpreterAI free trial is active";
  const trialDateText =
    opts?.trialEndsAt !== undefined ? formatEmailDate(opts.trialEndsAt instanceof Date ? opts.trialEndsAt : new Date(opts.trialEndsAt)) : null;
  const daysRemaining = Number(opts?.daysRemaining ?? NaN);
  const remainingLine = Number.isFinite(daysRemaining)
    ? daysRemaining > 0
      ? `You currently have about ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining before expiry.`
      : "According to your account, this trial end date has already passed."
    : null;
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts?.userId ?? null,
    heading: "Your free trial is active",
    bodyHtml: [
      emailParagraph("Hello,"),
      emailParagraph("Just a quick reminder that your InterpreterAI free trial is currently active."),
      emailParagraph("You have trial access with up to 3 hours of real-time interpreting per day."),
      emailParagraph(
        "InterpreterAI helps interpreters during calls and remote sessions with real-time transcription and translation.",
      ),
      emailParagraph("If you haven't tried it yet, tomorrow is a great time to start."),
      ...(trialDateText ? [emailParagraph(`Your trial is set to expire on ${trialDateText}.`)] : []),
      ...(remainingLine ? [emailParagraph(remainingLine)] : []),
      emailParagraph("You can test:"),
      emailBulletList([
        "Real-time transcription during calls",
        "Live translation while interpreting",
        "Tab Audio mode to capture the caller's speech",
        "Microphone mode for personal speech notes",
      ]),
      emailParagraph("Your feedback is extremely valuable as we continue improving the tool for interpreters."),
      emailParagraph("Best regards,"),
      emailParagraph("InterpreterAI"),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });

  return sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

function buildTrialAvailabilityReminderMail(
  _to: string,
  opts: { userId: number; trialEndsAt: Date | string; daysRemaining?: number | null },
): { subject: string; html: string } {
  const base = appBaseUrl();
  const subject = "Reminder: Your InterpreterAI free trial is active";
  const trialDateText = formatEmailDate(opts.trialEndsAt instanceof Date ? opts.trialEndsAt : new Date(opts.trialEndsAt));
  const daysRemaining = Number(opts.daysRemaining ?? NaN);
  const remainingLine = Number.isFinite(daysRemaining)
    ? daysRemaining > 0
      ? `You currently have about ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining before expiry.`
      : "According to your account, this trial end date has already passed."
    : null;
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts.userId,
    heading: "Your free trial is active",
    bodyHtml: [
      emailParagraph("Hello,"),
      emailParagraph("InterpreterAI is now fully available."),
      emailParagraph("Your free trial is currently active."),
      emailParagraph(`Your trial is set to expire on ${trialDateText}.`),
      ...(remainingLine ? [emailParagraph(remainingLine)] : []),
      emailParagraph("You can start using real-time transcription and translation right away in your workspace."),
      emailParagraph("Best regards,"),
      emailParagraph("InterpreterAI"),
    ].join(""),
    primaryButton: { href: workspaceUrl(), label: "Open Workspace" },
  });
  return { subject, html };
}

/** One-time immediate reminder for currently trial users (manual blast). */
export async function sendTrialAvailabilityReminderEmail(
  to: string,
  opts: { userId: number; trialEndsAt: Date | string; daysRemaining?: number | null },
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const { subject, html } = buildTrialAvailabilityReminderMail(to, opts);
  return sendEmail({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

/** Same email as {@link sendTrialAvailabilityReminderEmail}; returns Resend API outcome for scripts. */
export async function sendTrialAvailabilityReminderEmailWithResult(
  to: string,
  opts: { userId: number; trialEndsAt: Date | string; daysRemaining?: number | null },
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html } = buildTrialAvailabilityReminderMail(to, opts);
  return sendEmailWithResult({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

function buildAccountActiveReminderMail(
  _to: string,
  opts?: { userId?: number | null },
): { subject: string; html: string } {
  const base = appBaseUrl();
  const subject = "InterpreterAI reminder — continue using your daily AI interpreter hours";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts?.userId ?? null,
    heading: "Your account is active",
    bodyHtml: [
      emailParagraph("Hello,"),
      emailParagraph("Just a quick reminder that your InterpreterAI account is active and ready to use."),
      emailParagraph("You can use the platform every day for real-time transcription and translation sessions."),
      emailParagraph(
        "Your usage resets daily, so feel free to jump back in and continue using your available hours.",
      ),
      emailParagraph("Best regards"),
      emailParagraph("InterpreterAI"),
    ].join(""),
    primaryButton: { href: "https://app.interpreterai.org", label: "Open the app" },
  });
  return { subject, html };
}

/** One-time reminder blast email content (returns Resend API details for scripts). */
export async function sendAccountActiveReminderEmailWithResult(
  to: string,
  opts?: { userId?: number | null },
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html } = buildAccountActiveReminderMail(to, opts);
  return sendEmailWithResult({ from: RESEND_FROM_ONBOARDING, to, subject, html });
}

export async function sendSubscriptionConfirmationEmail(
  to: string,
  planName: string,
  nextBillingDate: string,
  displayName: string | null | undefined,
  recipientUserId: number,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI subscription is active";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
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
  displayName: string | null | undefined,
  recipientUserId: number,
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
    recipientUserId,
    heading: "Payment received",
    bodyHtml: [emailStandardGreeting(to, displayName), emailParagraph("Thank you — we received your payment."), ...lines].join(
      "",
    ),
    primaryButton: { href: billingUrl(), label: "Manage Billing" },
  });

  return sendEmail({ from: RESEND_FROM_NOREPLY, to, subject, html });
}

export async function sendSubscriptionCanceledEmail(
  to: string,
  displayName: string | null | undefined,
  recipientUserId: number,
): Promise<boolean> {
  if (!isResendConfigured()) return false;
  const base = appBaseUrl();
  const subject = "Your InterpreterAI subscription has been canceled";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
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

/** Subject for the one-time translation architecture product update (see send script). */
export const TRANSLATION_ARCHITECTURE_UPDATE_EMAIL_SUBJECT =
  "InterpreterAI Update — Translation Fixed & Improved";

const TRANSLATION_ARCHITECTURE_UPDATE_PLAIN_TEXT = `Hello,

We want to share an important update regarding InterpreterAI.

Some users recently reported that the translation was sometimes unstable, slow, or inaccurate during longer sentences. We sincerely apologize for that experience.

Over the past hours we rebuilt and improved major parts of the translation system, and the new version is now live.

The improvements include:
• More stable real-time translation
• Better handling of long sentences
• Faster response during live calls
• Reduced flickering or changing translations

The system should now perform much more accurately and consistently during interpretation sessions.

We invite you to test the updated version today and share your feedback with us.

You can access the platform here:
https://app.interpreterai.org

If your trial hours run out today, you still have two options to continue using the platform:

Option 1 — Basic Plan
3 hours per day for 30 days — $39/month

Option 2 — Referral Program
Invite 3 interpreters and receive 3 additional hours per day for 3 days.

Your feedback helps us improve the system for interpreters everywhere.

Thank you for being part of the early users of InterpreterAI.

Best regards,
InterpreterAI Team`;

function buildTranslationArchitectureUpdateMail(opts: { userId: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const base = appBaseUrl();
  const appHref = "https://app.interpreterai.org";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts.userId,
    heading: "Translation fixed & improved",
    bodyHtml: [
      emailParagraph("Hello,"),
      emailParagraph("We want to share an important update regarding InterpreterAI."),
      emailParagraph(
        "Some users recently reported that the translation was sometimes unstable, slow, or inaccurate during longer sentences. We sincerely apologize for that experience.",
      ),
      emailParagraph(
        "Over the past hours we rebuilt and improved major parts of the translation system, and the new version is now live.",
      ),
      emailParagraph("The improvements include:"),
      emailBulletList([
        "More stable real-time translation",
        "Better handling of long sentences",
        "Faster response during live calls",
        "Reduced flickering or changing translations",
      ]),
      emailParagraph(
        "The system should now perform much more accurately and consistently during interpretation sessions.",
      ),
      emailParagraph("We invite you to test the updated version today and share your feedback with us."),
      emailParagraph("You can access the platform here:"),
      emailParagraph(appHref),
      emailParagraph(
        "If your trial hours run out today, you still have two options to continue using the platform:",
      ),
      emailSubheading("Option 1 — Basic Plan"),
      emailParagraph("3 hours per day for 30 days — $39/month"),
      emailSubheading("Option 2 — Referral Program"),
      emailParagraph("Invite 3 interpreters and receive 3 additional hours per day for 3 days."),
      emailParagraph("Your feedback helps us improve the system for interpreters everywhere."),
      emailParagraph("Thank you for being part of the early users of InterpreterAI."),
      emailParagraph("Best regards,"),
      emailParagraph("InterpreterAI Team"),
    ].join(""),
    primaryButton: { href: appHref, label: "Open InterpreterAI" },
  });
  return {
    subject: TRANSLATION_ARCHITECTURE_UPDATE_EMAIL_SUBJECT,
    html,
    text: TRANSLATION_ARCHITECTURE_UPDATE_PLAIN_TEXT,
  };
}

/** One-time broadcast: translation pipeline improvements (script sets DB flag after success). */
export async function sendTranslationArchitectureUpdateEmailWithResult(
  to: string,
  opts: { userId: number },
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html, text } = buildTranslationArchitectureUpdateMail(opts);
  return sendEmailWithResult({ from: RESEND_FROM_NOREPLY, to, subject, html, text });
}

/** Subject for the one-time stability / baseline product update (see send script). */
export const STABILITY_BASELINE_UPDATE_EMAIL_SUBJECT =
  "InterpreterAI — Important update: stability, accuracy & your new baseline";

const STABILITY_BASELINE_UPDATE_PLAIN_TEXT = `Hi,

We want to sincerely apologize again for the instability you may have experienced recently.

Over the past few days, our development team was working on major improvements to both transcription and translation, which caused some inconsistency during live sessions. We understand how critical stability is during interpretation, and we truly appreciate your patience.

As of now, a significant update has been fully deployed.

Here's what has improved:

• Much more stable real-time performance — no more flickering or constant changes
• Improved accuracy during long sentences and fast speech
• Better handling of numbers, abbreviations, and terminology (e.g. SSI, DHS, medical terms)
• Cleaner and more consistent translation output during live calls

We have also adjusted the system to behave more like a real interpreting assistant — helping you follow the conversation clearly without missing key details.

Most importantly:

→ The system is now stable and consistent
→ The current version is not experimental — it is the new baseline going forward

You should notice the difference immediately during your sessions.

If you haven't tried it again recently, we invite you to test the updated version:

https://app.interpreterai.org

If your trial has ended:

• You can subscribe to continue using it (starting from $39/month)
• Or invite 3 interpreters to unlock additional usage time

We're continuing to improve the system, but from this point forward, our focus is on stability, accuracy, and reliability during real calls.

Your feedback is extremely valuable — and we're listening carefully.

Thank you again for your patience and support.

— InterpreterAI Team`;

function buildStabilityBaselineUpdateMail(opts: { userId: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const base = appBaseUrl();
  const appHref = "https://app.interpreterai.org";
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts.userId,
    heading: "Important update — now live",
    bodyHtml: [
      emailParagraph("Hi,"),
      emailParagraph(
        "We want to sincerely apologize again for the instability you may have experienced recently.",
      ),
      emailParagraph(
        "Over the past few days, our development team was working on major improvements to both transcription and translation, which caused some inconsistency during live sessions. We understand how critical stability is during interpretation, and we truly appreciate your patience.",
      ),
      emailParagraph("As of now, a significant update has been fully deployed."),
      emailParagraph("Here's what has improved:"),
      emailBulletList([
        "Much more stable real-time performance — no more flickering or constant changes",
        "Improved accuracy during long sentences and fast speech",
        "Better handling of numbers, abbreviations, and terminology (e.g. SSI, DHS, medical terms)",
        "Cleaner and more consistent translation output during live calls",
      ]),
      emailParagraph(
        "We have also adjusted the system to behave more like a real interpreting assistant — helping you follow the conversation clearly without missing key details.",
      ),
      emailSubheading("Most importantly"),
      emailBulletList([
        "The system is now stable and consistent",
        "The current version is not experimental — it is the new baseline going forward",
      ]),
      emailParagraph("You should notice the difference immediately during your sessions."),
      emailParagraph("If you haven't tried it again recently, we invite you to test the updated version:"),
      emailParagraph(appHref),
      emailParagraph("If your trial has ended:"),
      emailBulletList([
        "You can subscribe to continue using it (starting from $39/month)",
        "Or invite 3 interpreters to unlock additional usage time",
      ]),
      emailParagraph(
        "We're continuing to improve the system, but from this point forward, our focus is on stability, accuracy, and reliability during real calls.",
      ),
      emailParagraph("Your feedback is extremely valuable — and we're listening carefully."),
      emailParagraph("Thank you again for your patience and support."),
      emailParagraph("— InterpreterAI Team"),
    ].join(""),
    primaryButton: { href: appHref, label: "Open InterpreterAI" },
  });
  return {
    subject: STABILITY_BASELINE_UPDATE_EMAIL_SUBJECT,
    html,
    text: STABILITY_BASELINE_UPDATE_PLAIN_TEXT,
  };
}

/** One-time broadcast: stability / baseline announcement (script sets DB flag after success). */
export async function sendStabilityBaselineUpdateEmailWithResult(
  to: string,
  opts: { userId: number },
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html, text } = buildStabilityBaselineUpdateMail(opts);
  return sendEmailWithResult({ from: RESEND_FROM_NOREPLY, to, subject, html, text });
}

// ── Personal Glossary product announcement (one-time; run via send script) ───────────────────

export const GLOSSARY_FEATURE_ANNOUNCEMENT_EMAIL_SUBJECT =
  "InterpreterAI — Your Personal Glossary is live";

const GLOSSARY_FEATURE_ANNOUNCEMENT_PLAIN_TEXT = `Hi,

Tomorrow's a new week — and for most of you, that means long hours, back-to-back calls, and zero room for mistakes.

So we just shipped something that actually helps you work faster and cleaner:

Your Personal Glossary is now fully active and reliable.

Here's what that means for you:

- You can force your preferred translations for key terms (names, medical terms, legal phrases, etc.)
- The system will apply them automatically during your sessions
- It works without slowing you down — no extra steps, no interruptions
- You can add multiple variations (like "claim number, claim #") and control how they behave

How to use it (takes 30 seconds):
1. Open your workspace
2. Go to My Glossary
3. Add your term + preferred translation
4. Keep it on "Strict" for full control (recommended)

That's it — the system handles the rest in real time.

---

Why this matters

Every second counts when you're interpreting.
Every correction costs focus.

This feature is here so you:
- stop repeating yourself
- stay consistent across calls
- and move faster without sacrificing accuracy

---

You're about to go into a heavy week.

Set your glossary now, and let the system carry part of the load for you.

— InterpreterAI`;

function buildGlossaryFeatureAnnouncementMail(opts: { userId: number; to: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const base = appBaseUrl();
  const glossaryHref = workspaceUrl();
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts.userId,
    heading: "Your Personal Glossary is live",
    bodyHtml: [
      emailStandardGreeting(opts.to, null),
      emailParagraph(
        "Tomorrow's a new week — and for most of you, that means long hours, back-to-back calls, and zero room for mistakes.",
      ),
      emailParagraph("So we just shipped something that actually helps you work faster and cleaner:"),
      emailParagraph("Your Personal Glossary is now fully active and reliable."),
      emailSubheading("Here's what that means for you"),
      emailBulletList([
        "You can force your preferred translations for key terms (names, medical terms, legal phrases, etc.)",
        "The system will apply them automatically during your sessions",
        "It works without slowing you down — no extra steps, no interruptions",
        'You can add multiple variations (like "claim number, claim #") and control how they behave',
      ]),
      emailSubheading("How to use it (takes 30 seconds)"),
      emailOrderedList([
        "Open your workspace",
        "Go to My Glossary",
        "Add your term + preferred translation",
        'Keep it on "Strict" for full control (recommended)',
      ]),
      emailParagraph("That's it — the system handles the rest in real time."),
      emailSubheading("Why this matters"),
      emailParagraph("Every second counts when you're interpreting."),
      emailParagraph("Every correction costs focus."),
      emailParagraph("This feature is here so you:"),
      emailBulletList([
        "stop repeating yourself",
        "stay consistent across calls",
        "and move faster without sacrificing accuracy",
      ]),
      emailParagraph("You're about to go into a heavy week."),
      emailParagraph("Set your glossary now, and let the system carry part of the load for you."),
      emailParagraph("— InterpreterAI"),
    ].join(""),
    primaryButton: { href: glossaryHref, label: "Open workspace & My Glossary" },
    noteHtml: `<p style="margin:0;">Use <strong>My Glossary</strong> from the workspace sidebar after you sign in.</p>`,
  });
  return {
    subject: GLOSSARY_FEATURE_ANNOUNCEMENT_EMAIL_SUBJECT,
    html,
    text: GLOSSARY_FEATURE_ANNOUNCEMENT_PLAIN_TEXT,
  };
}

/** One-time broadcast: Personal Glossary announcement (script sets DB flag after success). */
export async function sendGlossaryFeatureAnnouncementEmailWithResult(
  to: string,
  opts: { userId: number },
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html, text } = buildGlossaryFeatureAnnouncementMail({ ...opts, to });
  return sendEmailWithResult({ from: RESEND_FROM_ONBOARDING, to, subject, html, text });
}

// ── Limited-time promo offer broadcast (one-time; run via send script) ───────────────────────

export const PROMO_OFFER_EMAIL_SUBJECT = "New Version of Interpreter AI + 2 Free Hours for You!";

const PROMO_OFFER_PLAIN_TEXT = `We are excited to announce a major update to Interpreter AI! The new version features significantly improved real-time transcription and a more stable translation engine.

As a limited-time promotion, we added 2 free hours to your access so you can try the latest version.

Open your workspace and start testing now:
https://app.interpreterai.org/workspace

— InterpreterAI Team`;

function buildPromoOfferMail(opts: { userId: number; to: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const base = appBaseUrl();
  const ws = workspaceUrl();
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: opts.userId,
    heading: "New Version of Interpreter AI + 2 Free Hours for You!",
    bodyHtml: [
      emailStandardGreeting(opts.to, null),
      emailParagraph(
        "We are excited to announce a major update to Interpreter AI! The new version features significantly improved real-time transcription and a more stable translation engine.",
      ),
      emailParagraph(
        "As a limited-time promotion, we added 2 free hours to your access so you can try the latest version.",
      ),
      emailParagraph("Open your workspace and start testing now:"),
      emailParagraph(ws),
      emailParagraph("— InterpreterAI Team"),
    ].join(""),
    primaryButton: { href: ws, label: "Open Workspace" },
  });
  return {
    subject: PROMO_OFFER_EMAIL_SUBJECT,
    html,
    text: PROMO_OFFER_PLAIN_TEXT,
  };
}

/** One-time broadcast: promo offer (script sets DB flag after success). */
export async function sendPromoOfferEmailWithResult(
  to: string,
  opts: { userId: number },
): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html, text } = buildPromoOfferMail({ ...opts, to });
  return sendEmailWithResult({ from: RESEND_FROM_ONBOARDING, to, subject, html, text });
}

// ── Product fix / stability apology broadcast (all users; run via send script) ───────────────

export const PRODUCT_FIX_ANNOUNCEMENT_EMAIL_SUBJECT = "We fixed it — and here's what changed";

const PRODUCT_FIX_SECTION_RULE = `<div style="margin:22px 0;border-top:1px solid #e5e7eb;line-height:0;font-size:0;">&nbsp;</div>`;

const PRODUCT_FIX_ANNOUNCEMENT_PLAIN_TEXT = `Hi,

Last week wasn't up to our standard.

Some of you experienced interruptions during live calls — especially unexpected logouts while using the app. This happened while we were actively fixing core issues, and it affected stability.

That's on us.

Now, it's fixed.

Here's what actually improved:

- No more random logouts during sessions
You can now stay in your calls without interruptions.

- Instant speaker detection (no delay, no confusion)
Before: speakers could appear in the same segment, then get reorganized after a delay.
Now: each speaker is detected immediately and placed in a clean, separate segment in real time.

- Cleaner transcripts — no duplicates, no missing words
What you see is exactly what's being said, structured properly from the start.

- More stable, more accurate translation
We optimized for accuracy and stability over speed.
Translations may appear slightly after speech, but they are clear, complete, and reliable without disrupting your flow.

---

We know some of you were disrupted during real work.

So we're adding this to your account:

+1 week free
5 hours/day access

---

We're confident in saying: the core issues are resolved.

InterpreterAI is built for real calls — and now it performs like it should have from the start.

Send feedback in the app (opens your workspace with the feedback form):
PLACEHOLDER_FEEDBACK_URL`;

function buildProductFixAnnouncementMail(): { subject: string; html: string; text: string } {
  const base = appBaseUrl();
  const feedbackHref = `${base}/workspace?feedback=1`;
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId: null,
    appendReferralAndUnsubscribe: false,
    footerMode: "legal-only",
    heading: PRODUCT_FIX_ANNOUNCEMENT_EMAIL_SUBJECT,
    bodyHtml: [
      emailParagraph("Hi,"),
      emailParagraph("Last week wasn't up to our standard."),
      emailParagraph(
        "Some of you experienced interruptions during live calls — especially unexpected logouts while using the app. This happened while we were actively fixing core issues, and it affected stability.",
      ),
      emailParagraph("That's on us."),
      emailParagraph("Now, it's fixed."),
      emailParagraph("Here's what actually improved:"),
      emailBulletList([
        "No more random logouts during sessions — You can now stay in your calls without interruptions.",
        "Instant speaker detection (no delay, no confusion). Before: speakers could appear in the same segment, then get reorganized after a delay. Now: each speaker is detected immediately and placed in a clean, separate segment in real time.",
        "Cleaner transcripts — no duplicates, no missing words — What you see is exactly what's being said, structured properly from the start.",
        "More stable, more accurate translation — We optimized for accuracy and stability over speed. Translations may appear slightly after speech, but they are clear, complete, and reliable without disrupting your flow.",
      ]),
      PRODUCT_FIX_SECTION_RULE,
      emailParagraph("We know some of you were disrupted during real work."),
      emailParagraph("So we're adding this to your account:"),
      emailTrialInformationBlock(
        `<p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;"><strong>+1 week free</strong></p><p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;"><strong>5 hours/day access</strong></p>`,
      ),
      PRODUCT_FIX_SECTION_RULE,
      emailParagraph("We're confident in saying: the core issues are resolved."),
      emailParagraph(
        "InterpreterAI is built for real calls — and now it performs like it should have from the start.",
      ),
    ].join(""),
    primaryButton: { href: feedbackHref, label: "Send feedback in the app" },
    noteHtml: `<p style="margin:0;">Please use the button above to open your workspace and submit feedback in the app. This message is not monitored for email replies.</p>`,
  });
  const text = PRODUCT_FIX_ANNOUNCEMENT_PLAIN_TEXT.replace(
    "PLACEHOLDER_FEEDBACK_URL",
    feedbackHref,
  );
  return {
    subject: PRODUCT_FIX_ANNOUNCEMENT_EMAIL_SUBJECT,
    html,
    text,
  };
}

/** Broadcast: product stability fixes + in-app feedback CTA (no billing side effects). */
export async function sendProductFixAnnouncementEmailWithResult(to: string): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { ok: false, exceptionMessage: "RESEND_API_KEY not configured" };
  }
  const { subject, html, text } = buildProductFixAnnouncementMail();
  return sendEmailWithResult({ from: RESEND_FROM_NOREPLY, to, subject, html, text });
}
