/**
 * Reusable global email shell for InterpreterAI.
 * Keeps a single header/body/footer layout for all automated emails.
 */
export type EmailBaseTemplateOptions = {
  title: string;
  logoUrl: string;
  emailWidthPx: number;
  bgPage: string;
  bgCard: string;
  borderColor: string;
  fontFamily: string;
  bodyColor: string;
  headingHtml?: string;
  contentHtml: string;
  footerHtml: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s).replace(/'/g, "&#39;");
}

export function renderEmailBaseTemplate(opts: EmailBaseTemplateOptions): string {
  const width = Math.max(480, Math.min(680, Math.floor(opts.emailWidthPx || 600)));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<title>${esc(opts.title || "InterpreterAI")}</title>
</head>
<body style="margin:0;padding:0;background-color:${opts.bgPage};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${opts.bgPage};border-collapse:collapse;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="${width}" cellspacing="0" cellpadding="0" border="0" style="max-width:${width}px;width:100%;margin:0 auto;background-color:${opts.bgCard};border-radius:12px;overflow:hidden;border:1px solid ${opts.borderColor};border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:28px 24px 8px;">
            <img src="${escAttr(opts.logoUrl)}" width="140" height="auto" alt="InterpreterAI" style="display:block;width:140px;max-width:140px;height:auto;margin:0 auto 20px auto;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;font-family:${opts.fontFamily};font-size:15px;line-height:1.65;color:${opts.bodyColor};">
            ${opts.headingHtml ?? ""}
            ${opts.contentHtml}
            ${opts.footerHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
