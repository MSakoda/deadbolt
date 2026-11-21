import { describe, expect, it } from 'vitest';
import { renderEmail } from '../src/email';
import { rawMessage, ResendMailer } from '../src/mail';

const base = { baseUrl: 'https://deadbolt.test' };
const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
const unb64 = (s: string) => Buffer.from(s.replace(/\r\n/g, ''), 'base64').toString('utf8');

describe('email layout', () => {
  const e = renderEmail({
    ...base,
    title: 'It is your turn',
    paragraphs: ['The group is waiting on you in "Friday group" (round 2).'],
    items: ['Friday group (round 2): 3 actions by others'],
    button: { label: 'Take your turn', url: 'https://deadbolt.test/api/auth/verify?token=abc-123' },
  });

  it('has a button, a paste-able link and the content in the HTML', () => {
    expect(e.html).toContain('<!doctype html>');
    expect(e.html).toContain('href="https://deadbolt.test/api/auth/verify?token=abc-123"');
    expect(e.html).toContain('Take your turn');
    expect(e.html).toContain('Button not working?');
    expect(e.html).toContain('Friday group (round 2): 3 actions by others');
  });

  it('keeps a complete plain-text twin with the link', () => {
    expect(e.text).toContain('It is your turn');
    expect(e.text).toContain('- Friday group (round 2): 3 actions by others');
    expect(e.text).toMatch(/token=abc-123/);
    expect(e.text).not.toContain('<');
  });

  it('escapes anything a player could type, in the title, text and list', () => {
    const bad = renderEmail({
      ...base,
      title: '<img src=x onerror=alert(1)>',
      paragraphs: ['Bob invited you to <script>alert(1)</script> & "more"'],
      items: ['<b>bold</b>'],
    });
    expect(bad.html).not.toContain('<script>');
    expect(bad.html).not.toContain('<img src=x');
    expect(bad.html).not.toContain('<b>bold</b>');
    expect(bad.html).toContain('&lt;script&gt;');
    expect(bad.html).toContain('&amp; &quot;more&quot;');
  });

  it('never turns a non-http link into a clickable button', () => {
    const e2 = renderEmail({ ...base, title: 't', paragraphs: ['p'], button: { label: 'Go', url: 'javascript:alert(1)' } });
    expect(e2.html).not.toContain('javascript:');
    expect(e2.html).not.toContain('Button not working?');
  });

  it('works with no button and no list', () => {
    const e3 = renderEmail({ ...base, title: 'Game cancelled', paragraphs: ['The host cancelled it.'] });
    expect(e3.html).toContain('Game cancelled');
    expect(e3.text).toContain('The host cancelled it.');
  });
});

describe('sending the styled version', () => {
  const mail = { to: 'b@x.com', subject: 'Hi', text: 'plain version', html: '<p>styled version</p>' };

  it('Gmail gets a multipart message with the text first, then the HTML', () => {
    const msg = decode(rawMessage({ name: 'Deadbolt', address: 'me@gmail.com' }, mail));
    const boundary = /boundary="([^"]+)"/.exec(msg)![1]!;
    expect(msg).toContain('Content-Type: multipart/alternative');
    const parts = msg.split(`--${boundary}`).slice(1, -1);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('text/plain');
    expect(unb64(parts[0]!.split('\r\n\r\n')[1]!)).toBe('plain version');
    expect(parts[1]).toContain('text/html');
    expect(unb64(parts[1]!.split('\r\n\r\n')[1]!)).toBe('<p>styled version</p>');
    expect(msg.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
  });

  it('Gmail still sends a single plain part when there is no HTML', () => {
    const msg = decode(rawMessage({ address: 'me@gmail.com' }, { to: 'b@x.com', subject: 'Hi', text: 'only text' }));
    expect(msg).toContain('Content-Type: text/plain');
    expect(msg).not.toContain('multipart');
  });

  it('Resend gets the HTML next to the text', async () => {
    let body: Record<string, unknown> = {};
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{"id":"1"}', { status: 200 }); }) as unknown as typeof fetch;
    await new ResendMailer('k', 'Deadbolt <hi@d.test>', f).send(mail);
    expect(body.html).toBe('<p>styled version</p>');
    expect(body.text).toBe('plain version');
  });
});
