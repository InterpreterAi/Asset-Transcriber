import { getStaticPublicBaseUrl } from "./authEnv.js";
import {
  emailCallout,
  emailGreeting,
  emailParagraph,
  emailPreformattedBlock,
  renderInterpreterAiEmail,
} from "./email-template.js";
import { sendEmail } from "./resend-mail.js";

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  const base = getStaticPublicBaseUrl();
  const html = renderInterpreterAiEmail({
    heading: "Welcome to InterpreterAI",
    bodyHtml: [
      emailParagraph("Hello,"),
      emailParagraph("Your InterpreterAI account has been successfully created."),
      emailParagraph(
        "You can now access real-time transcription and translation for live interpretation.",
      ),
    ].join(""),
    button: { href: base, label: "Log in to InterpreterAI" },
    noteHtml: `<p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">If you did not create this account, you can ignore this email.</p>`,
  });

  await sendEmail({
    to: toEmail,
    subject: "Welcome to InterpreterAI",
    html,
  });
}

export async function sendSupportConfirmationEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
): Promise<void> {
  const base = getStaticPublicBaseUrl();
  const html = renderInterpreterAiEmail({
    heading: "We received your message",
    bodyHtml: [
      emailGreeting("there"),
      emailParagraph(
        "Thanks for contacting InterpreterAI support. We've received your request and will get back to you as soon as we can.",
      ),
      emailCallout("Your subject", subject),
      emailParagraph(`Reference: ticket #${ticketId}.`),
    ].join(""),
    button: { href: base, label: "View my tickets" },
  });

  await sendEmail({
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
): Promise<void> {
  const base = getStaticPublicBaseUrl();
  const html = renderInterpreterAiEmail({
    heading: "New reply on your ticket",
    bodyHtml: [
      emailGreeting("there"),
      emailParagraph(`Regarding: ${subject} (ticket #${ticketId}).`),
      emailParagraph("Our team sent the following reply:"),
      emailPreformattedBlock(replyMessage),
    ].join(""),
    button: { href: base, label: "View full thread" },
  });

  await sendEmail({
    to: toEmail,
    subject: `[Ticket #${ticketId}] Re: ${subject}`,
    html,
  });
}

export async function sendTicketResolvedEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
): Promise<void> {
  const base = getStaticPublicBaseUrl();
  const html = renderInterpreterAiEmail({
    heading: "Your ticket is resolved",
    bodyHtml: [
      emailGreeting("there"),
      emailParagraph(
        "We've marked your support request as resolved. We hope everything is working well for you now.",
      ),
      emailCallout("Subject", subject),
      emailParagraph(
        "If something still isn't right, reply to this thread anytime — it will reopen so we can help.",
      ),
    ].join(""),
    button: { href: base, label: "View my tickets" },
  });

  await sendEmail({
    to: toEmail,
    subject: `[Ticket #${ticketId}] Your request has been resolved`,
    html,
  });
}
