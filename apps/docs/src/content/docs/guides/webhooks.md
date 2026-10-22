---
title: Webhooks
description: Send OpenCourse events to your own systems.
---

Admins register endpoints (URL, events, secret) under **Administration → Webhooks** or `/api/v1/admin/webhooks`. Every [domain event](../architecture/#events-and-the-worker) can be subscribed to.

## The request

Each event becomes a `POST` with a JSON body:

```json
{ "id": "…", "type": "enrollment.granted", "createdAt": "2026-10-21T12:00:00.000Z", "data": { } }
```

| Header                  | Meaning                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `OpenCourse-Event`      | The event name.                                                                             |
| `OpenCourse-Delivery`   | The delivery id. Delivery is at-least-once: deduplicate by it.                              |
| `OpenCourse-Signature`  | `t=<unix seconds>,v1=<hex>`                                                                 |

`v1` is the HMAC-SHA256 of `<t>.<body>` keyed with the endpoint secret. Reject an old `t` to stop replays.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function isValid(secret, header, rawBody, toleranceSeconds = 300) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const received = Buffer.from(v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

## Delivery and retries

- Any 2xx is success.
- A network error, a timeout (10 s), 5xx, 408 or 429 is retried 5 times with exponential backoff.
- Any other status fails at once. Redirects are never followed.
- The history (status, attempts, status code, error; no response body) is kept for 7 days and a failed delivery can be retried from the API or the screen.
- `POST /admin/webhooks/:id/test` sends a `webhook.test` event right away and reports the answer.

## Safety

The secret is shown once, on create and on rotate. Destinations must be public `https` addresses: loopback, private and link-local ranges are refused after DNS resolution, and plain `http` is refused. To reach a receiver on your own network (n8n, another container) set `WEBHOOKS_ALLOW_PRIVATE_NETWORKS=true` on the API and the worker, only if you trust every admin.

Ordering is not guaranteed and retry settings are not configurable per endpoint yet.
