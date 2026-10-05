import fp from 'fastify-plugin';
import type { Mailer } from '../mail/mailer';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
    /** Sends without making the request wait, so response time does not reveal e-mail outcomes. */
    sendMailInBackground(mail: Parameters<Mailer['send']>[0]): void;
  }
}

/** Requires the background plugin to be registered first. */
export const mailerPlugin = fp<{ mailer: Mailer }>(async (app, { mailer }) => {
  app.decorate('mailer', mailer);
  app.decorate('sendMailInBackground', (mail) => {
    app.runInBackground(async () => {
      try {
        await mailer.send(mail);
      } catch (error) {
        // never log the body: it can contain a one-time link
        app.log.error({ err: error, subject: mail.subject }, 'failed to send e-mail');
      }
    });
  });
});
