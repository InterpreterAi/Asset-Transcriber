/**
 * Unified InterpreterAI transactional layout: table-based, inline CSS for major clients; dark theme + brand colors.
 */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Body text on dark card */
const TEXT = "#e2e8f0";
const TEXT_MUTED = "#94a3b8";
const BG_OUTER = "#0f172a";
const BG_CARD = "#1e293b";
const BORDER = "#334155";
/** Primary CTA — brand purple */
const BTN_BG = "#7c3aed";

const SUPPORT_EMAIL = "support@interpreterai.org";
const FOOTER_TAGLINE = "You're receiving this email because you have an InterpreterAI account.";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape for double-quoted HTML attributes (e.g. href). */
export function escapeHtmlAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function formatEmailDate(d: Date, timeZone = "UTC"): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

export function emailLogoUrl(appBaseUrl: string): string {
  return `${normalizeBaseUrl(appBaseUrl)}/email/logo.png`;
}

export function emailFooterLinksHtml(appBaseUrl: string): string {
  const b = normalizeBaseUrl(appBaseUrl);
  const terms = escapeHtmlAttr(`${b}/terms`);
  const privacy = escapeHtmlAttr(`${b}/privacy`);
  const mail = escapeHtmlAttr(`mailto:${SUPPORT_EMAIL}`);
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.6;color:${TEXT_MUTED};">
<a href="${terms}" style="color:#a78bfa;text-decoration:underline;">Terms of Service</a>
<span style="color:${TEXT_MUTED};">&nbsp;·&nbsp;</span>
<a href="${privacy}" style="color:#a78bfa;text-decoration:underline;">Privacy Policy</a>
</p>
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${TEXT_MUTED};">
Support: <a href="${mail}" style="color:#a78bfa;text-decoration:none;">${escapeHtml(SUPPORT_EMAIL)}</a>
</p>`;
}

export type InterpreterAiEmailOptions = {
  /** App origin for logo URL and footer links (no trailing slash). */
  appBaseUrl: string;
  /** Main title (plain text, escaped). */
  heading?: string;
  /** Main content: safe HTML only. */
  bodyHtml: string;
  primaryButton?: { href: string; label: string };
  /** Optional muted block below button (safe HTML). */
  noteHtml?: string;
};

/**
 * Full HTML: dark outer, card, logo header, title, body, purple CTA, legal footer.
 */
export function renderInterpreterAiEmail(opts: InterpreterAiEmailOptions): string {
  const logo = escapeHtmlAttr(emailLogoUrl(opts.appBaseUrl));
  const base = normalizeBaseUrl(opts.appBaseUrl);

  const headingBlock = opts.heading
    ? `<h1 style="margin:0 0 20px;font-family:${FONT};font-size:22px;font-weight:700;color:#f8fafc;line-height:1.3;letter-spacing:-0.02em;">${escapeHtml(opts.heading)}</h1>`
    : "";

  const btn = opts.primaryButton;
  const buttonBlock = btn
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;border-collapse:collapse;width:100%;">
  <tr>
    <td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${escapeHtmlAttr(btn.href)}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="12%" fillcolor="${BTN_BG}">
        <w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">${escapeHtml(btn.label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${escapeHtmlAttr(btn.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;line-height:1.2;background-color:${BTN_BG};border-radius:10px;mso-hide:all;">${escapeHtml(btn.label)}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`
    : "";

  const noteBlock = opts.noteHtml
    ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:13px;line-height:1.55;color:${TEXT_MUTED};">${opts.noteHtml}</div>`
    : "";

  const footerLinks = emailFooterLinksHtml(base);
  const tagline = escapeHtml(FOOTER_TAGLINE);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${opts.heading ? escapeHtml(opts.heading) : "InterpreterAI"}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_OUTER};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BG_OUTER};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:24px 12px 32px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background-color:${BG_CARD};border-radius:16px;overflow:hidden;border:1px solid ${BORDER};border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:28px 24px 20px;border-bottom:1px solid ${BORDER};">
            <img src="${logo}" width="200" height="auto" alt="InterpreterAI" style="display:block;max-width:200px;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 8px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">
            ${headingBlock}
            ${opts.bodyHtml}
            ${buttonBlock}
            ${noteBlock}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 28px;">
            ${footerLinks}
            <p style="margin:16px 0 0;font-family:${FONT};font-size:11px;line-height:1.5;color:#64748b;">${tagline}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Styled paragraph (content escaped). */
export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(text)}</p>`;
}

export function emailGreeting(displayName: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">Hi ${escapeHtml(displayName)},</p>`;
}

export function emailPreformattedBlock(text: string): string {
  return `<div style="margin:16px 0;padding:16px 18px;background-color:#0f172a;border-left:4px solid ${BTN_BG};border-radius:8px;font-family:${FONT};font-size:14px;line-height:1.6;color:${TEXT};white-space:pre-wrap;">${escapeHtml(text)}</div>`;
}

export function emailCallout(label: string, value: string): string {
  return `<div style="margin:16px 0;padding:16px 18px;background-color:#0f172a;border-radius:10px;border:1px solid ${BORDER};">
<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:${TEXT};line-height:1.5;">${escapeHtml(value)}</p>
</div>`;
}

/** Numbered list (items escaped). */
export function emailOrderedList(items: string[]): string {
  const lis = items
    .map(
      (t) =>
        `<li style="margin:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(t)}</li>`,
    )
    .join("");
  return `<ol style="margin:0 0 18px;padding-left:20px;color:${TEXT};">${lis}</ol>`;
}

/** Bullet list (items escaped). */
export function emailBulletList(items: string[]): string {
  const lis = items
    .map(
      (t) =>
        `<li style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(t)}</li>`,
    )
    .join("");
  return `<ul style="margin:0 0 18px;padding-left:20px;color:${TEXT};list-style-type:disc;">${lis}</ul>`;
}

/** Subheading inside body (escaped). */
export function emailSubheading(text: string): string {
  return `<p style="margin:20px 0 10px;font-family:${FONT};font-size:13px;font-weight:700;color:#c4b5fd;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(text)}</p>`;
}
