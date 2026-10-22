# OpenCourse

Open source, self-hosted course platform: courses with video, text and quizzes, access through grants, progress, certificates, e-mails and outbound webhooks. The interface and each course are available in English and Portuguese (Brazil).

- **Live demo** (runs on in-browser mock data): https://zerobertoo.github.io/opencourse/
- **Documentation**: https://zerobertoo.github.io/opencourse/docs/ (English and Portuguese)
- **Specification**: [docs/PRD.md](docs/PRD.md), the original intent. The documentation describes the current state.

Current gap: course covers are links with no upload.

## Quick start

Requirements: Docker (with Compose). To work on the code you also need Node 20 or newer (`.nvmrc` pins 24) and pnpm 9.

```bash
cp .env.example .env     # then replace AUTH_SECRET, for example with: openssl rand -base64 48
docker compose up -d --build
curl localhost:3000/health
```

The compose file applies the migrations and starts the API (http://localhost:3000, OpenAPI reference at `/docs`), the worker, the web app, Postgres, Redis, S3-compatible storage and Mailpit (http://localhost:8025, catches every e-mail sent in development). The first account created on an instance becomes its admin. Every credential in `.env.example` is a development default: change them all before a real deployment.

Already running Postgres, Redis and S3-compatible storage? Use the app-only setup (`compose.app.yaml`). Both setups are described in the [self-hosting guide](https://zerobertoo.github.io/opencourse/docs/guides/self-hosting/).

## Development

```bash
pnpm install
pnpm infra      # only the data services (Postgres, Redis, storage, Mailpit)
pnpm dev        # development servers
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

The [development guide](https://zerobertoo.github.io/opencourse/docs/guides/development/) covers running the API and the worker with hot reload, the web app against the real API, demo data, authentication and the test suites (API tests need Postgres, Redis, the storage and `ffmpeg`).

## Structure

- `apps/web`: frontend (React, Vite, Tailwind, react-i18next). It runs on mock data without `VITE_API_URL`.
- `apps/api`: backend (Fastify, Drizzle, Postgres, Redis) and its background worker.
- `apps/docs`: documentation site (Starlight).
- `packages/shared`: types and zod schemas, the contract between web and API.
- `docs`: the PRD and the video and files guides (also published in the site).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions and the pull request flow. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[AGPL-3.0](LICENSE).
