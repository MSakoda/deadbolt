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
