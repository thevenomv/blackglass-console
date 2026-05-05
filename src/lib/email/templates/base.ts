/**
 * Base HTML email layout.
 *
 * Design tokens from exports-and-comms.md:
 *   bg    #f1f5f9   text  #0f172a   muted #64748b
 *   link  #2563eb   border #e2e8f0
 *
 * Every template renders via `baseLayout({ subject, preheader, body })`.
 * The footer always includes the registered company address for GDPR / CAN-SPAM compliance.
 */

const COMPANY_ADDRESS =
  "Blackglass Security Ltd · 13 Freeland Park, Wareham Road, Poole, Dorset, BH16 6FA, United Kingdom";

export interface BaseLayoutOptions {
  subject: string;
  /** Short preview text shown by email clients before the body (max ~90 chars). */
  preheader: string;
  /** Inner HTML placed between header and footer. */
  body: string;
  /** Optional unsubscribe URL — required for marketing emails. */
  unsubscribeUrl?: string;
}

export function baseLayout({
  subject,
  preheader,
  body,
  unsubscribeUrl,
}: BaseLayoutOptions): string {
  const unsubscribeBlock = unsubscribeUrl
    ? `<tr><td style="padding:0 0 8px;text-align:center;">
        <a href="${unsubscribeUrl}" style="color:#94a3b8;font-size:11px;text-decoration:underline;">Unsubscribe</a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${escHtml(subject)}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    body{margin:0;padding:0;background:#f1f5f9;}
    img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    table{border-collapse:collapse!important;}
    @media only screen and (max-width:600px){
      .container{width:100%!important;border-radius:0!important;}
      .pad-mobile{padding:24px 16px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f1f5f9;line-height:1px;">
    ${escHtml(preheader)}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!-- Container -->
        <table class="container" role="presentation" cellpadding="0" cellspacing="0" border="0"
               width="560" style="background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">

          <!-- Header -->
          <tr>
            <td class="pad-mobile" style="padding:28px 40px 24px;border-bottom:1px solid #e2e8f0;">
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;
                           font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#0f172a;">
                BLACKGLASS
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="pad-mobile" style="padding:32px 40px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e2e8f0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${unsubscribeBlock}
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                              font-size:11px;color:#94a3b8;text-align:center;line-height:1.6;">
                    ${escHtml(COMPANY_ADDRESS)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Escape HTML special characters for safe interpolation into attributes and text. */
export function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Reusable heading block. */
export function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
             font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">${escHtml(text)}</h1>`;
}

/** Reusable paragraph block. */
export function p(text: string): string {
  return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
             font-size:15px;color:#475569;line-height:1.6;">${text}</p>`;
}

/** Reusable CTA button. */
export function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="border-radius:6px;background:#2563eb;">
        <a href="${url}"
           style="display:inline-block;padding:12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                  font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
          ${escHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Muted small text (e.g. "If the button doesn't work…"). */
export function small(text: string): string {
  return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
             font-size:12px;color:#94a3b8;line-height:1.6;">${text}</p>`;
}
