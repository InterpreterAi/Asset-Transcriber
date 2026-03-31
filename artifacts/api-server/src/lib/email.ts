import { Resend } from "resend";
import { logger } from "./logger.js";

const APP_URL = "https://asset-transcriber.replit.app";
const FROM_ADDRESS = "InterpreterAI <noreply@interpreterai.app>";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("RESEND_API_KEY is not set — email sending is disabled");
    return null;
  }
  return new Resend(key);
}

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: "Welcome to InterpreterAI",
      text: [
        "Hello,",
        "",
        "Your InterpreterAI account has been successfully created.",
        "",
        "You can now access real-time transcription and translation for live interpretation.",
        "",
        `Login here:\n${APP_URL}`,
        "",
        "If you did not create this account, please ignore this email.",
        "",
        "Best,",
        "InterpreterAI",
      ].join("\n"),
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#1d6ae5;padding:28px 36px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">InterpreterAI</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-0.3px;">Welcome to InterpreterAI</p>
              <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6;">Hello,</p>
              <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6;">
                Your InterpreterAI account has been successfully created.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                You can now access real-time transcription and translation for live interpretation.
              </p>
              <!-- Button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1d6ae5;border-radius:10px;">
                    <a href="${APP_URL}"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Log In to InterpreterAI
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#999;line-height:1.5;">
                If you did not create this account, please ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#aaa;">© 2026 InterpreterAI · All rights reserved</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
    logger.info({ email: toEmail }, "Welcome email sent");
  } catch (err) {
    logger.error({ err, email: toEmail }, "Failed to send welcome email");
  }
}
