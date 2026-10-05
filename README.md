# OpenCourse

Open source, self-hosted course platform. Full specification in [docs/PRD.md](docs/PRD.md).

Current state: the backend (`apps/api`) has accounts, sessions, roles, invites and an audit log. The frontend (`apps/web`) can run fully mocked (demo mode) or use the real API for sign-in, users and invites; courses, progress and grants are still mocked until their milestones.

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

## Authentication

Sessions use two httpOnly cookies: a short-lived access token and a rotating refresh token (limited to `/api/v1/auth`). State-changing requests must send the `x-requested-with: opencourse` header (CSRF defense), and login and recovery are rate limited three ways: per client IP, per account, and per (IP, account) pair, so neither one IP sweeping many accounts nor many IPs hammering one account gets through. Invite tokens are masked in the request logs. Behind HTTPS set `COOKIE_SECURE=true`; behind a reverse proxy set `TRUST_PROXY=true` so rate limits see the real client IP. Password recovery and invite e-mails go to Mailpit in development.

## Running the frontend against the real API

```bash
cp apps/web/.env.example apps/web/.env.local   # sets VITE_API_URL=http://localhost:3000
docker compose up -d --build --wait
pnpm --filter @opencourse/web dev
```

Without `VITE_API_URL` the app stays in demo mode. With it, the demo sign-in buttons disappear and the signed-in user is mirrored into the mock so the not-yet-migrated screens keep working; a real instructor owns no mock courses, so their Studio starts empty.

## Tests

- `pnpm test`: unit and API integration tests. The API tests use their own `<database>_test` database on the Compose Postgres, never the development one.
- `pnpm --filter @opencourse/api test:e2e`: end-to-end tests against the running Compose stack (accounts, e-mail links through Mailpit, resilience). The invite flow needs a fresh database (`docker compose down -v` wipes the local volumes).

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
