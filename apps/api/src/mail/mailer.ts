import nodemailer from 'nodemailer';
import type { Config } from '../config';
import { loadPlatformSettings } from '../modules/settings/service';
import type { Database } from '../plugins/db';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Outbound e-mail boundary. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Sends through the SMTP server saved in the platform settings (the `SMTP_*` environment variables
 * until an admin saves one; Mailpit in development). The password only ever comes from the
 * environment. `getDatabase` is a function because the API builds the mailer before its database
 * plugin is ready.
 */
export function createSmtpMailer(config: Config, getDatabase: () => Database): Mailer {
  return {
    async send(mail) {
      const { email } = await loadPlatformSettings(getDatabase(), config);
      const transport = nodemailer.createTransport({
        host: email.host,
        port: email.port,
        secure: email.secure,
        // an unreachable server must fail the send, not hold a worker slot for minutes
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        // the environment password only goes to the environment host: an admin who saves another
        // host must not be able to collect it
        auth:
          email.username && config.SMTP_PASSWORD && email.host === config.SMTP_HOST
            ? { user: email.username, pass: config.SMTP_PASSWORD }
            : undefined,
      });
      try {
        await transport.sendMail({ from: email.fromAddress, ...mail });
      } finally {
        transport.close();
      }
    },
  };
}
