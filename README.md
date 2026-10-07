# OpenCourse

Open source, self-hosted course platform. Full specification in [docs/PRD.md](docs/PRD.md).

Current state: the backend (`apps/api`, plus its background worker) has accounts, sessions, roles, invites, an audit log, courses with modules, lessons and translations, and access grants, lesson progress, graded quizzes, personal notes, enrollments, certificates and outbound webhooks. The frontend (`apps/web`) can run fully mocked (demo mode) or use the real API for everything except settings, which are still mocked until their milestone. File uploads (cover images, attachments, local video and caption files) wait for the storage adapter.

## Requirements

- Node 20 or newer (`.nvmrc` pins 22)
- pnpm 9
- Docker, for the backend stack and the API tests

## Commands

```bash
pnpm install
pnpm dev        # development servers
pnpm lint
pnpm typecheck
pnpm test       # API tests need Postgres and Redis (see below)
pnpm build
```

## Backend

The whole stack (API, worker, Postgres, Redis, S3-compatible storage, Mailpit) runs with Docker Compose:

```bash
docker compose up -d --build   # applies migrations, then starts the API and the worker
curl localhost:3000/health     # dependency status; /health/live is the cheap liveness probe
```

| Service  | URL                                   | Notes                                    |
| -------- | ------------------------------------- | ---------------------------------------- |
| API      | http://localhost:3000                 | OpenAPI reference at `/docs`             |
| Mailpit  | http://localhost:8025                 | catches every e-mail sent in development |
| Storage  | http://localhost:9001/rustfs/console/ | S3 API on port 9000, bucket `opencourse` |
| Postgres | localhost:5432                        | user, password and database `opencourse` |
| Redis    | localhost:6379                        |                                          |

Every credential above is a development default.

**Before the first run**, copy `.env.example` to `.env` and set `AUTH_SECRET` (the API refuses to start in production with the placeholder):

```bash
cp .env.example .env
# then replace AUTH_SECRET, for example with the output of: openssl rand -base64 48
```

The first account created on an instance becomes its admin; everyone after that starts as a student.

To work on the API with hot reload and run its tests, start only the data services:

```bash
docker compose up -d --wait postgres redis
pnpm --filter @opencourse/api db:migrate
pnpm --filter @opencourse/api dev
pnpm --filter @opencourse/api dev:worker   # in another terminal: certificates and e-mails need it
pnpm --filter @opencourse/api test
```

After changing a table in `apps/api/src/db/schema`, run `pnpm --filter @opencourse/api db:generate` and commit the new SQL file in `apps/api/migrations`.

## Courses and access

Course routes live under `/api/v1` and are documented in the OpenAPI reference at `/docs` (tags `courses`, `curriculum` and `grants`).

- **Who sees what.** Signed-in users list published courses (plus archived ones they still hold a grant for). Drafts answer 404 to anyone who cannot edit them, so their existence does not leak. The curriculum (lessons, content, video, quiz) needs an active grant, or being the course instructor or an admin; without one the course answers 403. Quiz answers are removed from every response to people who cannot manage the course.
- **Publishing.** A course goes live only when `getPublishIssues` (in `packages/shared`) reports nothing; a published course cannot be edited into a new problem. Links to videos and cover images must be `https`.
- **Grants.** Access to a course is always a grant. Instructors (for their own courses) and admins create, list, revoke and extend grants. A user has at most one open grant per course: granting again extends it instead of stacking, and revoking twice is harmless. Accepting an invite that names a course creates the grant in the same transaction as the account.
- **Audit.** Course status changes and grant creation, extension and revocation are written to the audit log.

## Studying: progress, quizzes, notes

Tags `progress`, `me` and `studio` in the OpenAPI reference.

- **Progress.** `PUT /lessons/:id/progress` marks a lesson completed (or not) and saves the video position; `GET /courses/:id/progress` lists the caller's records. Only people who can read the course may write. In courses with sequential order the server refuses to complete, save a position or take a quiz on a locked lesson. Video lessons complete only when the client asks (the player decides when, for instance at ~90%); quiz lessons complete only by passing.
- **Quizzes.** `POST /quizzes/:lessonId/attempts` grades on the server: the student never receives `isCorrect`, only per-question feedback after submitting, and the right option is revealed only once the attempt passed. Attempts are unlimited and all kept; the pass mark is the quiz's own; passing completes the lesson for good.
- **Access changes.** Revoking or letting a grant expire hides the course and its progress but deletes nothing; granting again brings it all back.
- **Enrollments.** `GET /me/courses` lists active grants (archived courses included) with a progress summary; `GET /me/continue-learning` points to the next lesson with the saved video position. Managers get `GET /courses/:id/students` and `GET /studio/metrics` (active students, completion rate).
- **Notes.** `GET`/`PUT /lessons/:id/note`: private to their author; blank text erases the note.
- **Events and the worker.** Six domain events exist (`user.created`, `enrollment.granted`, `grant.revoked`, `lesson.completed`, `course.completed`, `certificate.issued`) and all are written the same way: registering or accepting an invite writes `user.created`, a new grant `enrollment.granted`, a revocation `grant.revoked` (once). Completing a lesson or a course writes `lesson.completed` and `course.completed` to the `outbox_events` table in the same transaction as the progress row (typed in `packages/shared`), so an event exists exactly when the change does. The worker (`apps/api/src/worker.ts`, same image as the API, `node dist/worker.js`) polls the outbox about once a second, adds one BullMQ job per consumer (Redis) and stamps the event dispatched; stamped rows are deleted after 7 days. Consumers live in `src/worker/consumers.ts`; failed jobs are retried 5 times with exponential backoff and then kept for inspection. Delivery is at-least-once, so consumers must be idempotent. Without a running worker nothing is lost: events wait in the outbox. Progress and these events are not audited.
- **Outbound webhooks.** Admins register endpoints (URL, events, secret) under `/api/v1/admin/webhooks` or in Administration, Webhooks. For each event, the worker's `fan-out-webhooks` consumer creates one row in `webhook_deliveries` per active endpoint subscribed to it (unique per event and endpoint, so a rerun after a crash adds nothing) and queues a `deliver-webhook` job, which sends `POST` with a JSON body `{ id, type, createdAt, data }` and the headers `OpenCourse-Event`, `OpenCourse-Delivery` (the delivery id: receivers should deduplicate by it, delivery is at-least-once) and `OpenCourse-Signature: t=<unix seconds>,v1=<hex>`, where `v1` is the HMAC-SHA256 of `<t>.<body>` keyed with the endpoint secret (reject an old `t` to stop replays). Any 2xx is success; a network error, timeout (10 s), 5xx, 408 or 429 is retried 5 times with exponential backoff, and any other status (3xx included: redirects are never followed) fails at once. The history (status, attempts, status code, error, no response body) is kept 7 days and a failed delivery can be retried from the API or the screen. The secret is shown once, on create and on rotate, and is stored in clear text because it is needed to sign. `POST /admin/webhooks/:id/test` sends a `webhook.test` event right away and reports the answer. Destinations must be public `https` addresses: loopback, private, link-local and similar ranges are refused after DNS resolution (the connection goes to the checked address), and plain `http` is refused. To reach receivers on your own network (n8n, another container) set `WEBHOOKS_ALLOW_PRIVATE_NETWORKS=true` on the API and the worker, only if you trust every admin. Not included yet: ordering guarantees, per-endpoint retry settings and `video.processed`.
- **Certificates.** Finishing a course (with the course certificate template enabled) issues one certificate per student and course, forever: `UNIQUE (user_id, course_id)` and `ON CONFLICT DO NOTHING` make repeated `course.completed` events harmless, and only the insert that wins records `certificate.issued`. The holder name, course titles and template are copied into the row, so later edits never change a verifiable certificate. The row, its audit entry (no actor) and the `certificate.issued` event commit together. The worker issues it right after the course is completed (up to about a second later) and e-mails the student with retries; `email_sent_at` is set once the e-mail went out and stays null if every attempt fails, and a crash between sending and recording can mail twice. `GET /me/certificates` lists the caller's; `GET /certificates/verify/:code` is public and rate limited, answers the same 404 for malformed and unknown codes, and exposes no e-mail or ids. Codes look like `OC-XXXX-XXXX`. The PDF is rendered by the web client from the stored data (names outside Latin-1 print as `?`); a server-side PDF waits for the storage adapter. People who finished before the outbox existed get theirs with `pnpm --filter @opencourse/api certificates:backfill` (idempotent, sends no e-mail). There is no revocation or reissue yet.

## Demo data in the real database

```bash
pnpm --filter @opencourse/api db:seed:demo
```

Creates four accounts (`admin@`, `instructor@`, `student@` and `student2@opencourse.example`, all with the development password `demo-password-123`), three courses (two published, one draft) and a few grants (active, expiring, expired and revoked). It is safe to run again: existing accounts and courses are never overwritten. It refuses to run when `NODE_ENV=production`.

## Authentication

Sessions use two httpOnly cookies: a short-lived access token and a rotating refresh token (limited to `/api/v1/auth`). State-changing requests must send the `x-requested-with: opencourse` header (CSRF defense), and login and recovery are rate limited three ways: per client IP, per account, and per (IP, account) pair, so neither one IP sweeping many accounts nor many IPs hammering one account gets through. Invite tokens are masked in the request logs. Behind HTTPS set `COOKIE_SECURE=true`; behind a reverse proxy set `TRUST_PROXY=true` so rate limits see the real client IP. Password recovery and invite e-mails go to Mailpit in development.

## Running the frontend against the real API

```bash
cp apps/web/.env.example apps/web/.env.local   # sets VITE_API_URL=http://localhost:3000
docker compose up -d --build --wait
pnpm --filter @opencourse/web dev
```

Without `VITE_API_URL` the app stays in demo mode. With it, the demo sign-in buttons disappear and the mock starts empty (under its own storage keys, so demo and real data never mix). Everything except settings goes to the API; only the signed-in user is mirrored into the mock, so settings keeps working. Finishing a course issues its certificate on the server. A new instructor starts with an empty Studio: create courses there, or run the demo seed above. Attachments and local video or caption uploads are hidden until the storage adapter exists; videos are added by `https` link (a direct video file, since the player is a plain `<video>`).

## Tests

- `pnpm test`: unit and API integration tests. The API tests use their own `<database>_test` database on the Compose Postgres, never the development one.
- `pnpm --filter @opencourse/api test:e2e`: end-to-end tests against the running Compose stack (accounts, courses and grants, e-mail links through Mailpit, resilience). The first account of an instance is the admin, so the flows that need one (invites, courses and grants) run only on a fresh database; elsewhere they skip themselves (`docker compose down -v` wipes the local volumes). Set `E2E_API_URL` to point the tests at another API, for example one started by hand on a scratch database; the resilience file stops Compose services, so run only `e2e/auth` and `e2e/courses` that way.

## Demo

The mocked login accepts any credentials. On the sign-in screen, the "sign in as student, instructor or admin" buttons open the app with ready-made demo data. The state lives in `sessionStorage` and is reset when the tab is closed.

## Structure

- `apps/web`: frontend (React, Vite, Tailwind, react-i18next)
- `apps/api`: backend (Fastify, Drizzle, Postgres, Redis)
- `packages/shared`: shared types and zod schemas, the contract between web and API

## Contributing

- Code, comments and documentation are written in English.
- UI text always goes through i18n (`pt-BR` and `en`); there are no hard-coded strings in components.
- Components never read data directly: everything goes through the interfaces in `apps/web/src/services`.
