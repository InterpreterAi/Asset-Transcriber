/**
 * Shared InterpreterAI transactional layout: table-based, inline CSS for Gmail and major clients.
 */

const FOOTER_TEXT = "You're receiving this email because you signed up for InterpreterAI.";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const BODY_TEXT = "#374151";
const MUTED = "#6b7280";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape a string for use inside double-quoted HTML attributes (e.g. href). */
export function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export type InterpreterAiEmailOptions = {
  /** Optional title below the brand bar (plain text, escaped). */
  heading?: string;
  /** Main content: safe HTML only (callers must escape user-controlled strings). */
  bodyHtml: string;
  /** Primary CTA; omit when no button is needed. */
  button?: { href: string; label: string };
  /** Optional extra block above the footer (safe HTML). */
  noteHtml?: string;
};

/**
 * Full HTML document: centered ~600px white card, blue header "InterpreterAI", body, blue button, footer.
 */
export function renderInterpreterAiEmail(opts: InterpreterAiEmailOptions): string {
  const headingBlock = opts.heading
    ? `<p style="margin:0 0 20px;font-family:${FONT};font-size:22px;font-weight:700;color:#111827;line-height:1.25;">${escapeHtml(opts.heading)}</p>`
    : "";

  const buttonBlock = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0 0;border-collapse:collapse;">
  <tr>
    <td align="left" style="background-color:#1d6ae5;border-radius:10px;">
      <a href="${escapeHtmlAttr(opts.button.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;line-height:1.2;">${escapeHtml(opts.button.label)}</a>
    </td>
  </tr>
</table>`
    : "";

  const noteBlock = opts.noteHtml
    ? `<div style="margin-top:24px;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${opts.noteHtml}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="x-ua-compatible" content="ie=edge">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f6;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f4f6;border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.08);border-collapse:collapse;">
        <tr>
          <td style="background-color:#1d6ae5;padding:24px 32px;">
            <p style="margin:0;font-family:${FONT};font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">InterpreterAI</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 8px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BODY_TEXT};">
            ${headingBlock}
            ${opts.bodyHtml}
            ${buttonBlock}
            ${noteBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 32px;">
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.55;color:#9ca3af;">${escapeHtml(FOOTER_TEXT)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Styled paragraph for template body (content is escaped). */
export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BODY_TEXT};">${escapeHtml(text)}</p>`;
}

/** “Hi {name},” with escaped display name. */
export function emailGreeting(displayName: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BODY_TEXT};">Hi ${escapeHtml(displayName)},</p>`;
}

/** Reply / note block with preserved line breaks (content escaped). */
export function emailPreformattedBlock(text: string): string {
  return `<div style="margin:16px 0;padding:16px 18px;background-color:#f0f7ff;border-left:4px solid #1d6ae5;border-radius:8px;font-family:${FONT};font-size:14px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
}

/** Muted callout box (e.g. ticket subject) — label and value escaped. */
export function emailCallout(label: string, value: string): string {
  return `<div style="margin:16px 0;padding:16px 18px;background-color:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:#111827;line-height:1.5;">${escapeHtml(value)}</p>
</div>`;
}
