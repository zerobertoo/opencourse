---
title: Architecture
description: How the pieces fit together.
---

OpenCourse is a pnpm monorepo.

| Package           | What it is                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web`        | React, Vite, Tailwind. Reads data only through `src/services`, which can run on in-browser mocks.   |
| `apps/api`        | Fastify, Drizzle, Postgres. Its second entrypoint, `src/worker.ts`, is the background worker.       |
| `packages/shared` | Types and zod schemas: the contract between web and API, and the source of the OpenAPI document.    |

## Contract first

Request and response schemas live in `packages/shared` as zod and are used by the routes. The OpenAPI reference (at `/docs` on the API) is generated from them, and every error uses one shared schema.

## Access is a grant

A student reaches a course only through a grant: it has a source (`manual`, `invite`, ...), an optional expiry and can be revoked. There is no price, purchase or payment code. A future plugin that sells courses creates grants through the API or reacts to events.

## Events and the worker

State changes write a domain event to the `outbox_events` table in the same transaction that causes them, so an event exists exactly when the change does. The worker polls the outbox, adds one BullMQ job per consumer and marks the event dispatched.

| Event                 | Written when                                    |
| --------------------- | ----------------------------------------------- |
| `user.created`        | an account is registered or an invite accepted  |
| `enrollment.granted`  | a grant is created, or its expiry changes (`extended: true`) |
| `grant.revoked`       | a grant is revoked (once)                       |
| `lesson.completed`    | a student completes a lesson                    |
| `course.completed`    | a student completes the last lesson of a course |
| `certificate.issued`  | a certificate is issued                         |
| `video.processed`     | an uploaded video finished encoding             |

The worker (`apps/api/src/worker.ts`, same image as the API, `node dist/worker.js`) polls the outbox about once a second, and rows already dispatched are deleted after 7 days. Consumers live in `src/worker/consumers.ts`. A failed job is retried 5 times with exponential backoff and then kept for inspection.

Delivery is at-least-once, so consumers must be idempotent. Without a running worker nothing is lost: events wait in the outbox. Consumers shipped today: certificates and their e-mail, [webhooks](../webhooks/) and the video encoder.

## Extension points

- **Video providers.** Links are resolved by `VideoProviderPlugin`s listed in a registry. See [Video](../video/#writing-a-provider-plugin).
- **Events and webhooks.** Subscribe from outside with [webhooks](../webhooks/), or add a consumer in `apps/api/src/worker/consumers.ts`.
- **Access.** Create grants through the API.

## Internationalisation

The interface uses react-i18next with `pt-BR` and `en` namespaces, and a test fails when a locale misses a key or an ICU argument. Course content is translated per course, with a fallback when a translation is missing.
