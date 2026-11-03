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
