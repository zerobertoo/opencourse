import nodemailer from 'nodemailer';
import type { Config } from '../config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Outbound e-mail boundary. A queue-backed implementation can replace SMTP later. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Sends through the configured SMTP server (Mailpit in development). */
export function createSmtpMailer(config: Config): Mailer {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth:
      config.SMTP_USER && config.SMTP_PASSWORD
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: config.SMTP_FROM, ...mail });
    },
  };
}
