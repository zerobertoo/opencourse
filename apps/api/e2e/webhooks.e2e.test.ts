import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, inject, it } from 'vitest';
import { Browser, PASSWORD, uniqueEmail, waitFor } from './support';

// the worker runs in a container, so the receiver is reached through the host; this needs the stack
// started with WEBHOOKS_ALLOW_PRIVATE_NETWORKS=true (plain http to a private address)
it('delivers a signed user.created webhook to a receiver and records the delivery', async (context) => {
  const provided = inject('e2eAdmin');
  if (provided.role !== 'admin') return context.skip();

  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({ headers: request.headers, body: Buffer.concat(chunks).toString() });
      response.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, '0.0.0.0', resolve));
  const port = (receiver.address() as AddressInfo).port;

  const admin = new Browser();
  await admin.call('POST', '/auth/login', { email: provided.email, password: PASSWORD });
  const created = await admin.call('POST', '/admin/webhooks', {
    url: `http://host.docker.internal:${port}/hook`,
    events: ['user.created'],
    description: 'e2e receiver',
  });
  if (created.status === 400) {
    receiver.close();
    return context.skip();
  }
  expect(created.status).toBe(201);
  const { id: webhookId, secret } = created.body.webhook as { id: string; secret: string };

  try {
    const email = uniqueEmail('webhook-user');
    await new Browser().call('POST', '/auth/register', {
      name: 'Webhook User',
      email,
      password: PASSWORD,
    });

    await waitFor(
      'the receiver to get the webhook',
      async () => received.some((request) => request.body.includes(email)),
      30_000,
    );
    const request = received.find((candidate) => candidate.body.includes(email))!;
    expect(request.headers['opencourse-event']).toBe('user.created');
    expect(JSON.parse(request.body)).toMatchObject({
      type: 'user.created',
      data: { email, name: 'Webhook User' },
    });

    const [, timestamp, signature] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(
      request.headers['opencourse-signature'] as string,
    )!;
    expect(signature).toBe(
      createHmac('sha256', secret).update(`${timestamp}.${request.body}`).digest('hex'),
    );

    await waitFor(
      'the delivery to be recorded as succeeded',
      async () => {
        const history = await admin.call('GET', `/admin/webhooks/${webhookId}/deliveries`);
        return (history.body.deliveries as { status: string }[]).some(
          (delivery) => delivery.status === 'succeeded',
        );
      },
      15_000,
    );
  } finally {
    await admin.call('DELETE', `/admin/webhooks/${webhookId}`);
    receiver.closeAllConnections();
    receiver.close();
  }
}, 60_000);
