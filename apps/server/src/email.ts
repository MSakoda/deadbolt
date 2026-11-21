export interface EmailContent {
  title: string;
  /** Plain sentences. They are escaped, never treated as markup. */
  paragraphs: string[];
  /** A short list, one line each. */
  items?: string[];
  button?: { label: string; url: string };
  /** The grey preview line some inboxes show beside the subject. */
  preheader?: string;
  footer?: string;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const C = { page: '#0f1218', card: '#1a1e27', line: '#2c3340', text: '#e6e9ef', body: '#c5cad6', dim: '#8d97a8', accent: '#c0392b', button: '#1f7aa3', link: '#4fc3f7' };

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const isHttp = (u: string): boolean => /^https?:\/\//i.test(u);

/**
 * One layout for every email: a dark card in the game's colours, built from nested tables with inline
 * styles because that is what mail apps render reliably. Returns the HTML and a plain-text twin.
 */
export function renderEmail(c: EmailContent & { baseUrl: string }): { text: string; html: string } {
  const footer = c.footer ?? 'You are getting this because you play Deadbolt, a cooperative zombie game for friends.';
  const url = c.button && isHttp(c.button.url) ? c.button.url : '';

  const text = [
    c.title,
    ...c.paragraphs,
    ...(c.items?.length ? [c.items.map((i) => `- ${i}`).join('\n')] : []),
    ...(c.button ? [`${c.button.label}:\n${c.button.url}`] : []),
    `${footer}\n${c.baseUrl}`,
  ].join('\n\n') + '\n';

  const p = (s: string) => `<p style="margin:0 0 16px;font:400 16px/1.55 ${FONT};color:${C.body};">${escapeHtml(s)}</p>`;
  const items = c.items?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">${c.items
        .map((i) => `<tr><td width="14" valign="top" style="padding:8px 0;"><div style="width:6px;height:6px;margin-top:8px;background:${C.accent};border-radius:3px;"></div></td><td style="padding:8px 0;border-bottom:1px solid ${C.line};font:400 15px/1.5 ${FONT};color:${C.body};">${escapeHtml(i)}</td></tr>`)
        .join('')}</table>`
    : '';
  const button = url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td bgcolor="${C.button}" style="background:${C.button};border-radius:8px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 30px;font:700 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(c.button!.label)}</a></td></tr></table>
       <p style="margin:0;font:400 12px/1.5 ${FONT};color:${C.dim};word-break:break-all;">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(url)}" style="color:${C.link};">${escapeHtml(url)}</a></p>`
    : '';
  const logo = `${c.baseUrl.replace(/\/$/, '')}/logo.png`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(c.title)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(c.preheader ?? c.paragraphs[0] ?? c.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 4px 16px;"><img src="${escapeHtml(logo)}" alt="" width="36" height="36" style="vertical-align:middle;border:0;"><span style="margin-left:10px;vertical-align:middle;font:700 14px/1 ${FONT};letter-spacing:4px;color:${C.text};">DEADBOLT</span></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-top:3px solid ${C.accent};border-radius:10px;padding:28px 28px 24px;">
<h1 style="margin:0 0 18px;font:700 24px/1.25 ${FONT};color:${C.text};">${escapeHtml(c.title)}</h1>
${c.paragraphs.map(p).join('\n')}
${items}
${button}
</td></tr>
<tr><td style="padding:18px 4px 0;font:400 12px/1.6 ${FONT};color:${C.dim};">${escapeHtml(footer)}<br><a href="${escapeHtml(c.baseUrl)}" style="color:${C.dim};">${escapeHtml(c.baseUrl.replace(/^https?:\/\//, ''))}</a></td></tr>
</table></td></tr></table>
</body></html>`;

  return { text, html };
}
