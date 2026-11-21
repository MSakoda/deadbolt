import { HttpError } from './types';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Logs mail to the console and keeps it in `outbox` (used by tests). Swap for Resend later. */
export class ConsoleMailer implements Mailer {
  outbox: Mail[] = [];

  constructor(private quiet = false) {}

  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
    if (!this.quiet) console.log(`\n--- mail to ${mail.to} ---\n${mail.subject}\n\n${mail.text}\n---`);
  }
}

/**
 * Sends through Resend's HTTPS API. Failures are logged (status and Resend's message only, never the
 * mail body, which holds sign-in links) and surface as a 502 so callers do not report success.
 */
export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async send(mail: Mail): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      });
    } catch (e) {
      console.error('resend: request failed', (e as Error).message);
      throw new HttpError(502, 'could not send email');
    }
    if (!res.ok) {
      const detail = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? '';
      console.error(`resend: ${res.status} sending to ${mail.to}: ${detail}`);
      throw new HttpError(502, 'could not send email');
    }
  }
}

export interface GmailConfig {
  /** The Gmail address mail is sent from. */
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Display name shown to recipients. */
  name?: string;
}

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();
const encodedWord = (s: string): string => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;

/** A plain-text RFC 822 message, UTF-8, ready for the Gmail API (which wants it base64url). */
export function rawMessage(from: { name?: string; address: string }, mail: Mail): string {
  const fromHeader = from.name ? `${encodedWord(oneLine(from.name))} <${oneLine(from.address)}>` : oneLine(from.address);
  const body = Buffer.from(mail.text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const msg = [
    `From: ${fromHeader}`,
    `To: ${oneLine(mail.to)}`,
    `Subject: ${encodedWord(oneLine(mail.subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(msg, 'utf8').toString('base64url');
}

/**
 * Sends from a Gmail account over HTTPS (the Gmail API), because free hosting blocks SMTP ports.
 * Needs a one-time OAuth refresh token (see scripts/gmail-token.ts). Failures log only a status and
 * Google's error code, never tokens or the mail body, and surface as a 502.
 */
export class GmailMailer implements Mailer {
  private token?: { value: string; expires: number };

  constructor(
    private cfg: GmailConfig,
    private fetchFn: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > this.now() + 60_000) return this.token.value;
    let res: Response;
    try {
      res = await this.fetchFn('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          refresh_token: this.cfg.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
    } catch (e) {
      console.error('gmail: token request failed', (e as Error).message);
      throw new HttpError(502, 'could not send email');
    }
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !json?.access_token) {
      console.error(`gmail: token refresh failed (${res.status} ${json?.error ?? 'unknown'}). If this is invalid_grant, create a new refresh token.`);
      throw new HttpError(502, 'could not send email');
    }
    this.token = { value: json.access_token, expires: this.now() + (json.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  async send(mail: Mail): Promise<void> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.fetchFn('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw: rawMessage({ name: this.cfg.name, address: this.cfg.user }, mail) }),
      });
    } catch (e) {
      console.error('gmail: send failed', (e as Error).message);
      throw new HttpError(502, 'could not send email');
    }
    if (!res.ok) {
      const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? '';
      if (res.status === 401) this.token = undefined;
      console.error(`gmail: ${res.status} sending to ${mail.to}: ${detail}`);
      throw new HttpError(502, 'could not send email');
    }
  }
}
