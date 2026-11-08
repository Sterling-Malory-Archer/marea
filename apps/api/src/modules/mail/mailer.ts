import nodemailer from "nodemailer";
import type { Env } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly driver: "log" | "smtp";
  send(msg: MailMessage): Promise<void>;
}

/**
 * Development driver: nothing leaves the machine. The message is written to the
 * API log (so links can be followed locally) and kept in memory for tests.
 */
export class LogMailer implements Mailer {
  readonly driver = "log" as const;
  readonly sent: MailMessage[] = [];
  constructor(private log: Logger) {}
  async send(msg: MailMessage) {
    this.sent.push(msg);
    if (this.sent.length > 200) this.sent.shift();
    this.log.info({ to: msg.to, subject: msg.subject, text: msg.text }, "E-mail (MAIL_DRIVER=log — not sent)");
  }
}

class SmtpMailer implements Mailer {
  readonly driver = "smtp" as const;
  private transport;
  constructor(private env: Env) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  async send(msg: MailMessage) {
    await this.transport.sendMail({ from: this.env.MAIL_FROM, ...msg });
  }
}

export function createMailer(env: Env, log: Logger): Mailer {
  return env.MAIL_DRIVER === "smtp" ? new SmtpMailer(env) : new LogMailer(log);
}
