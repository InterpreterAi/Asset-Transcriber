import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.EMAIL_FROM?.trim(),
  );
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT?.trim() || "587");
    const secure = port === 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!.trim(),
        pass: process.env.SMTP_PASS!.trim(),
      },
    });
  }
  return transporter;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Send mail via SMTP (nodemailer). Uses SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.
 * Returns false if SMTP is incomplete or send fails; failures are logged.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transport = getTransporter();
  const from = process.env.EMAIL_FROM?.trim();
  if (!transport || !from) {
    logger.warn(
      { to },
      "SMTP not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM) — email skipped",
    );
    return false;
  }
  try {
    await transport.sendMail({
      from,
      to,
      subject,
      text: htmlToPlainText(html),
      html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to }, "SMTP send failed");
    return false;
  }
}

export async function sendSmtpMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const transport = getTransporter();
  const from = process.env.EMAIL_FROM?.trim();
  if (!transport || !from) {
    logger.warn("SMTP not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM) — email skipped");
    return false;
  }
  try {
    await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? options.text.replace(/\n/g, "<br>"),
    });
    return true;
  } catch (err) {
    logger.error({ err, to: options.to }, "SMTP send failed");
    return false;
  }
}
