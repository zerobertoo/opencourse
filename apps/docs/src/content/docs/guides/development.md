---
title: Development
description: Run the apps, the demo data and the tests.
---

Contribution rules are in [CONTRIBUTING](https://github.com/zerobertoo/opencourse/blob/main/CONTRIBUTING.md). This page is about running things.

## Working on the API

Start only the data services, then run the apps with hot reload:

```bash
pnpm infra                                 # Postgres, Redis, storage (bucket included) and Mailpit
pnpm --filter @opencourse/api db:migrate
pnpm --filter @opencourse/api dev
pnpm --filter @opencourse/api dev:worker   # in another terminal: certificates and e-mails need it
pnpm --filter @opencourse/api test
```

After changing a table in `apps/api/src/db/schema`, run `pnpm --filter @opencourse/api db:generate` and commit the new SQL file in `apps/api/migrations`.

## Running the web app against the real API

```bash
cp apps/web/.env.example apps/web/.env.local   # sets VITE_API_URL=http://localhost:3000
docker compose up -d --build --wait
pnpm --filter @opencourse/web dev
```

Without `VITE_API_URL` the app stays in demo mode: the mocked login accepts any credentials, the "sign in as student, instructor or admin" buttons open ready-made data, and the state lives in `sessionStorage`.

With it, the demo buttons disappear and the mock starts empty, under its own storage keys so demo and real data never mix. Everything goes to the API (settings included: branding, languages and the mail server are saved in the database, and the SMTP password stays in `SMTP_PASSWORD`); only the signed-in user is mirrored into the mock. A new instructor starts with an empty Studio: create courses there, or load the demo data below.

## Authentication

Sessions use two httpOnly cookies: a short-lived access token and a rotating refresh token (limited to `/api/v1/auth`).

- State-changing requests must send the `x-requested-with: opencourse` header (CSRF defense).
- Login and recovery are rate limited three ways: per client IP, per account, and per (IP, account) pair, so neither one IP sweeping many accounts nor many IPs hammering one account gets through.
- Invite tokens are masked in the request logs.
- Behind HTTPS set `COOKIE_SECURE=true`. Behind a reverse proxy set `TRUST_PROXY=true` so rate limits see the real client IP.
- Password recovery and invite e-mails go to Mailpit in development.

## Demo data in the real database

```bash
pnpm --filter @opencourse/api db:seed:demo
```

It creates four accounts (`admin@`, `instructor@`, `student@` and `student2@opencourse.example`, all with the development password `demo-password-123`), three courses (two published, one draft) and a few grants (active, expiring, expired and revoked). It is safe to run again: existing accounts and courses are never overwritten. It refuses to run when `NODE_ENV=production`, unless `ALLOW_DEMO_SEED=true` is set, for a throwaway test server only.

Run the same script with `--remove` to undo it. That deletes the demo courses and accounts (and their grants, progress and certificates) and nothing else, and fails without changing anything if real data still points at a demo account.

On a deployed stack the built script is in the API image: open a terminal in the `api` container and run `ALLOW_DEMO_SEED=true node dist/seed-demo.js` (add `--remove` to undo).

## Tests

- `pnpm test` runs unit and API integration tests. The API tests use their own `<database>_test` database on the Compose Postgres, never the development one, and need Postgres, Redis, the storage and `ffmpeg`.
- `pnpm --filter @opencourse/api test:e2e` runs end-to-end tests against the running Compose stack: accounts, the full course journey, e-mail links through Mailpit, webhooks and resilience.
  - Start the stack with `RATE_LIMIT_DISABLED=true`, because the suite registers more accounts than the sign-up limit of 10 per hour allows (CI does the same), and with an `AUTH_SECRET` of your own.
  - The first account of an instance is the admin, so the flows that need one run only on a fresh database; elsewhere they skip themselves (`docker compose down -v` wipes the local volumes).
  - Set `E2E_API_URL` to point the tests at another API. The resilience file stops Compose services, so run only `e2e/auth` and `e2e/courses` that way.
