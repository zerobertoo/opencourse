import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedRequest {
  headers: IncomingMessage['headers'];
  body: string;
}

/** What the receiver does with a request; the default answers 200. */
export type Responder = (request: ReceivedRequest, response: ServerResponse, count: number) => void;

/** A real HTTP server standing in for the system that receives webhooks. */
export class WebhookReceiver {
  readonly requests: ReceivedRequest[] = [];
  private server: Server;
  respond: Responder = (_request, response) => response.writeHead(200).end('ok');

  private constructor() {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const received = { headers: request.headers, body: Buffer.concat(chunks).toString() };
        this.requests.push(received);
        this.respond(received, response, this.requests.length);
      });
    });
  }

  static async start(): Promise<WebhookReceiver> {
    const receiver = new WebhookReceiver();
    await new Promise<void>((resolve) => receiver.server.listen(0, '127.0.0.1', resolve));
    return receiver;
  }

  get url(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/hook`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

/** Recomputes the signature the way a receiver would; true when the header matches. */
export function signatureIsValid(header: string, secret: string, body: string): boolean {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  if (!match) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.${body}`).digest('hex');
  return expected === match[2];
}
