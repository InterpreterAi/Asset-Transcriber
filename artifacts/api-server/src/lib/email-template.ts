/**
 * Single InterpreterAI transactional layout — table-based, inline CSS for Gmail / Outlook / mobile.
 * Logo: production CDN (see LOGO_URL). Footer and links use appBaseUrl.
 */

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Centered header logo (production). */
export const INTERPRETER_AI_LOGO_URL = "https://app.interpreterai.org/logo.png";

const BG_PAGE = "#f4f4f6";
const BG_CARD = "#ffffff";
const TEXT = "#374151";
const TEXT_HEADING = "#111827";
const BORDER = "#e5e7eb";
const FOOTER_COLOR = "#8a8f98";

/** CTA gradient (fallback solid for clients that strip gradients). */
const BTN_GRADIENT = "linear-gradient(135deg,#7B61FF,#5B8CFF)";
const BTN_FALLBACK = "#7B61FF";

const SUPPORT_EMAIL = "support@interpreterai.org";
const FOOTER_TAGLINE = "You're receiving this email because you have an InterpreterAI account.";

const EMAIL_WIDTH = 520;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

/** First name only, capitalized; null → caller uses “there”. */
export function firstNameForGreeting(email: string, explicitName?: string | null): string | null {
  const t = explicitName?.trim();
  if (t && !t.includes("@")) {
    const first = t.split(/[\s_.-]+/).filter(Boolean)[0] ?? "";
    if (!first) return null;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  const local = email.split("@")[0]?.split(/[._+-]/)[0]?.trim() ?? "";
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

/** “Hi Mohamed,” or “Hi there,” */
export function emailStandardGreeting(recipientEmail: string, explicitName?: string | null): string {
  const first = firstNameForGreeting(recipientEmail, explicitName);
  const who = first ?? "there";
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">Hi ${escapeHtml(who)},</p>`;
}

export function emailFooterBlockHtml(appBaseUrl: string): string {
  const b = normalizeBaseUrl(appBaseUrl);
  const terms = escapeHtmlAttr(`${b}/terms`);
  const privacy = escapeHtmlAttr(`${b}/privacy`);
  const mail = escapeHtmlAttr(`mailto:${SUPPORT_EMAIL}`);
  const tag = escapeHtml(FOOTER_TAGLINE);
  return `<div style="margin-top:32px;padding-top:24px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:13px;line-height:1.65;color:${FOOTER_COLOR};">
<p style="margin:0 0 10px;">
<a href="${terms}" style="color:${FOOTER_COLOR};text-decoration:underline;">Terms of Service</a>
<span style="color:${FOOTER_COLOR};">&nbsp;•&nbsp;</span>
<a href="${privacy}" style="color:${FOOTER_COLOR};text-decoration:underline;">Privacy Policy</a>
</p>
<p style="margin:0 0 10px;">Support: <a href="${mail}" style="color:${FOOTER_COLOR};text-decoration:underline;">${escapeHtml(SUPPORT_EMAIL)}</a></p>
<p style="margin:0;">${tag}</p>
</div>`;
}

/** Trial / billing callout — light panel per brand spec. */
export function emailTrialInformationBlock(innerHtmlSafe: string): string {
  return `<div style="background-color:#f5f6fb;border-radius:8px;padding:16px;margin:20px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${innerHtmlSafe}</div>`;
}

export function emailTrialWelcomeInner(trialEndDateFormatted: string): string {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em;">TRIAL INFORMATION</p>
<p style="margin:0 0 12px;">Your free trial has started.</p>
<p style="margin:0;">Your free trial ends on:<br /><strong style="color:${TEXT_HEADING};">${escapeHtml(trialEndDateFormatted)}</strong></p>`;
}

export function emailTrialReminderInner(trialEndDateFormatted: string): string {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em;">TRIAL INFORMATION</p>
<p style="margin:0 0 8px;">Your free trial will end on:</p>
<p style="margin:0 0 12px;"><strong style="color:${TEXT_HEADING};">${escapeHtml(trialEndDateFormatted)}</strong></p>`;
}

export function emailTrialExpiredInner(): string {
  return `<p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.06em;">TRIAL INFORMATION</p>
<p style="margin:0;">Your free trial has ended. Upgrade to keep using real-time transcription and translation.</p>`;
}

export type InterpreterAiEmailOptions = {
  /** Used for footer links only (Terms, Privacy). */
  appBaseUrl: string;
  heading?: string;
  bodyHtml: string;
  primaryButton?: { href: string; label: string };
  noteHtml?: string;
};

function primaryButtonHtml(href: string, label: string): string {
  const h = escapeHtmlAttr(href);
  const l = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;border-collapse:collapse;">
  <tr>
    <td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="10%" fillcolor="${BTN_FALLBACK}">
        <w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:600;">${l}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${h}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff !important;text-decoration:none;line-height:1.2;border-radius:8px;background-color:${BTN_FALLBACK};background-image:${BTN_GRADIENT};mso-hide:all;">${l}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/**
 * Unified layout: 520px card, centered logo (140px), title, body, gradient CTA, standard footer.
 */
export function renderInterpreterAiEmail(opts: InterpreterAiEmailOptions): string {
  const logo = escapeHtmlAttr(INTERPRETER_AI_LOGO_URL);
  const base = normalizeBaseUrl(opts.appBaseUrl);

  const headingBlock = opts.heading
    ? `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:22px;font-weight:700;color:${TEXT_HEADING};line-height:1.3;">${escapeHtml(opts.heading)}</h1>`
    : "";

  const buttonBlock = opts.primaryButton
    ? primaryButtonHtml(opts.primaryButton.href, opts.primaryButton.label)
    : "";

  const noteBlock = opts.noteHtml
    ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:13px;line-height:1.55;color:${FOOTER_COLOR};">${opts.noteHtml}</div>`
    : "";

  const footer = emailFooterBlockHtml(base);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${opts.heading ? escapeHtml(opts.heading) : "InterpreterAI"}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BG_PAGE};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="${EMAIL_WIDTH}" cellspacing="0" cellpadding="0" border="0" style="max-width:${EMAIL_WIDTH}px;width:100%;margin:0 auto;background-color:${BG_CARD};border-radius:12px;overflow:hidden;border:1px solid ${BORDER};border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:28px 24px 8px;">
            <img src="${logo}" width="140" height="auto" alt="InterpreterAI" style="display:block;width:140px;max-width:140px;height:auto;margin:0 auto 20px auto;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">
            ${headingBlock}
            ${opts.bodyHtml}
            ${buttonBlock}
            ${noteBlock}
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(text)}</p>`;
}

export function emailPreformattedBlock(text: string): string {
  return `<div style="margin:16px 0;padding:16px 18px;background-color:#f5f6fb;border-radius:8px;font-family:${FONT};font-size:14px;line-height:1.6;color:${TEXT};white-space:pre-wrap;">${escapeHtml(text)}</div>`;
}

export function emailCallout(label: string, value: string): string {
  return `<div style="margin:16px 0;padding:16px 18px;background-color:#f5f6fb;border-radius:8px;border:1px solid ${BORDER};">
<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(label)}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:${TEXT_HEADING};line-height:1.5;">${escapeHtml(value)}</p>
</div>`;
}

export function emailOrderedList(items: string[]): string {
  const lis = items
    .map(
      (t) =>
        `<li style="margin:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(t)}</li>`,
    )
    .join("");
  return `<ol style="margin:0 0 18px;padding-left:20px;color:${TEXT};">${lis}</ol>`;
}

export function emailBulletList(items: string[]): string {
  const lis = items
    .map(
      (t) =>
        `<li style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:1.65;color:${TEXT};">${escapeHtml(t)}</li>`,
    )
    .join("");
  return `<ul style="margin:0 0 18px;padding-left:20px;color:${TEXT};list-style-type:disc;">${lis}</ul>`;
}

export function emailSubheading(text: string): string {
  return `<p style="margin:22px 0 10px;font-family:${FONT};font-size:13px;font-weight:700;color:#5B8CFF;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(text)}</p>`;
}
