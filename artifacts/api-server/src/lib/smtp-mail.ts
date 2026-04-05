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

export async function sendSmtpMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const transport = getTransporter();
  const from = process.env.EMAIL_FROM!.trim();
  if (!transport) {
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
