import { getStaticPublicBaseUrl } from "./authEnv.js";
import { adminAlertEmail, formatAdminAlertTime } from "./admin-alert-email.js";
import {
  emailCallout,
  emailParagraph,
  emailPreformattedBlock,
  emailStandardGreeting,
  renderInterpreterAiEmail,
} from "./email-template.js";
import {
  RESEND_FROM_ONBOARDING,
  RESEND_FROM_SECURITY,
  RESEND_FROM_SUPPORT,
  sendEmail,
} from "./resend-mail.js";

function appBaseUrl(): string {
  return getStaticPublicBaseUrl().replace(/\/+$/, "");
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  recipientUserId: number,
): Promise<void> {
  const base = appBaseUrl();
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Reset your password",
    bodyHtml: [
      emailStandardGreeting(toEmail, null),
      emailParagraph("We received a request to reset your password."),
      emailParagraph("Click the button below to create a new password."),
    ].join(""),
    primaryButton: { href: resetUrl, label: "Reset Password" },
    noteHtml: `<p style="margin:0 0 8px;"><strong>Security note:</strong> This link expires in <strong>1 hour</strong>.</p>
<p style="margin:0;">If you did not request a reset, you can safely ignore this email.</p>`,
  });

  const ok = await sendEmail({
    from: RESEND_FROM_SECURITY,
    to: toEmail,
    subject: "Reset your InterpreterAI password",
    html,
  });
  if (!ok) {
    throw new Error(
      "Password reset email was not delivered (check RESEND_API_KEY and Resend dashboard logs)",
    );
  }
}

export async function sendSupportConfirmationEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
  recipientUserId: number,
): Promise<void> {
  const base = appBaseUrl();
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "We received your message",
    bodyHtml: [
      emailStandardGreeting(toEmail, null),
      emailParagraph(
        "Thanks for contacting InterpreterAI support. We've received your request and will get back to you as soon as we can.",
      ),
      emailCallout("Your subject", subject),
      emailParagraph(`Reference: ticket #${ticketId}.`),
    ].join(""),
    primaryButton: { href: `${base}/workspace`, label: "View my tickets" },
  });

  await sendEmail({
    from: RESEND_FROM_SUPPORT,
    to: toEmail,
    subject: `[Ticket #${ticketId}] We received your support request`,
    html,
  });
}

export async function sendAdminReplyEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
  replyMessage: string,
  recipientUserId: number | null,
): Promise<void> {
  const base = appBaseUrl();
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "New reply on your ticket",
    bodyHtml: [
      emailStandardGreeting(toEmail, null),
      emailParagraph(`Regarding: ${subject} (ticket #${ticketId}).`),
      emailParagraph("Our team sent the following reply:"),
      emailPreformattedBlock(replyMessage),
    ].join(""),
    primaryButton: { href: `${base}/workspace`, label: "View full thread" },
  });

  await sendEmail({
    from: RESEND_FROM_SUPPORT,
    to: toEmail,
    subject: `[Ticket #${ticketId}] Re: ${subject}`,
    html,
  });
}

export async function sendTicketResolvedEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
  recipientUserId: number | null,
): Promise<void> {
  const base = appBaseUrl();
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    recipientUserId,
    heading: "Your ticket is resolved",
    bodyHtml: [
      emailStandardGreeting(toEmail, null),
      emailParagraph(
        "We've marked your support request as resolved. We hope everything is working well for you now.",
      ),
      emailCallout("Subject", subject),
      emailParagraph(
        "If something still isn't right, reply to this thread anytime — it will reopen so we can help.",
      ),
    ].join(""),
    primaryButton: { href: `${base}/workspace`, label: "View my tickets" },
  });

  await sendEmail({
    from: RESEND_FROM_SUPPORT,
    to: toEmail,
    subject: `[Ticket #${ticketId}] Your request has been resolved`,
    html,
  });
}

/** Operator alert: a user opened a ticket or replied on one. */
export async function sendAdminSupportTicketAlert(opts: {
  ticketId: number;
  username: string | null;
  userEmail: string;
  subject: string;
  message: string;
  kind: "new" | "reply";
  reopened?: boolean;
}): Promise<void> {
  const to = adminAlertEmail();
  if (!to) return;
  const base = appBaseUrl();
  const who = opts.username ? `@${opts.username}` : opts.userEmail;
  const heading =
    opts.kind === "new" ? `New support ticket #${opts.ticketId}` : `New reply on ticket #${opts.ticketId}`;
  const html = renderInterpreterAiEmail({
    appBaseUrl: base,
    appendReferralAndUnsubscribe: false,
    footerMode: "legal-only",
    heading,
    bodyHtml: [
      emailParagraph(
        opts.kind === "new"
          ? `${who} just opened a support ticket.`
          : `${who} replied on their ticket${opts.reopened ? " (it was closed and is now reopened)" : ""}.`,
      ),
      emailCallout("From", `${who} · ${opts.userEmail}`),
      emailCallout("Subject", opts.subject),
      emailPreformattedBlock(opts.message),
      emailParagraph(`Received ${formatAdminAlertTime(new Date())}.`),
    ].join(""),
    primaryButton: { href: `${base}/admin?tab=support`, label: "Open in admin" },
  });

  await sendEmail({
    from: RESEND_FROM_SUPPORT,
    to,
    subject:
      opts.kind === "new"
        ? `[Support] New ticket #${opts.ticketId} from ${who}: ${opts.subject}`
        : `[Support] Reply on ticket #${opts.ticketId} from ${who}: ${opts.subject}`,
    html,
  });
}
