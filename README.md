# OpenCourse

Open source, self-hosted course platform. Full specification in [docs/PRD.md](docs/PRD.md).

Current state: the backend (`apps/api`) has accounts, sessions, roles, invites, an audit log, courses with modules, lessons and translations, and access grants. The frontend (`apps/web`) can run fully mocked (demo mode) or use the real API for sign-in, users, invites, courses, curriculum and grants; enrollments, progress, notes, certificates, settings and the Studio dashboard are still mocked until their milestones. File uploads (cover images, attachments, local video and caption files) wait for the storage adapter.

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

The whole stack (API, Postgres, Redis, S3-compatible storage, Mailpit) runs with Docker Compose:

```bash
docker compose up -d --build   # applies migrations, then starts the API
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
pnpm --filter @opencourse/api test
```

After changing a table in `apps/api/src/db/schema`, run `pnpm --filter @opencourse/api db:generate` and commit the new SQL file in `apps/api/migrations`.

## Courses and access

Course routes live under `/api/v1` and are documented in the OpenAPI reference at `/docs` (tags `courses`, `curriculum` and `grants`).

- **Who sees what.** Signed-in users list published courses (plus archived ones they still hold a grant for). Drafts answer 404 to anyone who cannot edit them, so their existence does not leak. The curriculum (lessons, content, video, quiz) needs an active grant, or being the course instructor or an admin; without one the course answers 403. Quiz answers are removed from every response to people who cannot manage the course.
- **Publishing.** A course goes live only when `getPublishIssues` (in `packages/shared`) reports nothing; a published course cannot be edited into a new problem. Links to videos and cover images must be `https`.
- **Grants.** Access to a course is always a grant. Instructors (for their own courses) and admins create, list, revoke and extend grants. A user has at most one open grant per course: granting again extends it instead of stacking, and revoking twice is harmless. Accepting an invite that names a course creates the grant in the same transaction as the account.
- **Audit.** Course status changes and grant creation, extension and revocation are written to the audit log.

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

Without `VITE_API_URL` the app stays in demo mode. With it, the demo sign-in buttons disappear and the mock starts empty (under its own storage keys, so demo and real data never mix). The signed-in user, and the courses and grants the app reads or changes, are mirrored into the mock so the not-yet-migrated screens (enrollments, progress, certificates) keep working; the mirror is cleared when the account changes. A new instructor starts with an empty Studio: create courses there, or run the demo seed above. Attachments and local video or caption uploads are hidden until the storage adapter exists; videos are added by `https` link (a direct video file, since the player is a plain `<video>`). Quizzes cannot be graded for students yet: the API never sends the correct answers, and grading arrives with its own backend milestone, so submitting a quiz answers "unavailable" in this mode.

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
