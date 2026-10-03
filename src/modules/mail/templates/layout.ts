export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Minimal email with one call-to-action button; edit to match your brand. */
export function actionEmail(options: {
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): MailContent {
  const { subject, intro, action, url, outro } = options;
  return {
    subject,
    text: `${intro}\n\n${action}: ${url}\n\n${outro}`,
    html: `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:480px;margin:auto;padding:24px">
<p>${escape(intro)}</p>
<p><a href="${escape(url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escape(action)}</a></p>
<p style="color:#666;font-size:14px">${escape(outro)}</p>
</body></html>`,
  };
}
