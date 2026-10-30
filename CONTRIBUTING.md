# Contributing to OpenCourse

Thanks for helping! Bug reports, docs fixes, translations and code are all welcome.

By contributing you agree that your work is released under the project's [AGPL-3.0 license](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Look for an existing issue first. Issues labeled `good first issue` and `help wanted` are a good start.
- For anything bigger than a small fix, open an issue (or a Discussion) before coding so we can agree on the approach.
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Setup

Requirements: Node 22.23.4+ (`.nvmrc` pins 24.22.1), pnpm 9, Docker, and `ffmpeg` on the PATH for the video tests.

```sh
pnpm install
cp .env.example .env            # then replace AUTH_SECRET
pnpm infra                      # Postgres, Redis, storage (bucket included) and Mailpit
pnpm dev
```

The [development guide](https://zerobertoo.github.io/opencourse/docs/guides/development/) has the full backend, demo and test instructions.

## Checks

Run these before opening a pull request; CI runs the same:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

API tests hit a real Postgres, Redis and S3 storage, never mocks.

## Conventions

- Code, comments and documentation are written in English.
- UI text always goes through i18n (`pt-BR` and `en`). No hard-coded strings in components.
- Components never read data directly; everything goes through `apps/web/src/services`.
- API is contract first: request/response zod schemas live in `packages/shared`, errors use `apiErrorSchema`.
- Schema changes: edit `apps/api/src/db/schema`, run `pnpm --filter @opencourse/api db:generate` and commit the SQL in `apps/api/migrations`.
- Course access is always a Grant. Do not add price, purchase or payment UI.
- Use logical CSS properties (`ms`, `me`, `ps`, `pe`) and CSS variables for colors.
- Add or update tests with your change.

## File layout

The layout names things after what they do, not after a type. With a contract-first API the types are inferred from the zod schemas (`z.infer`), so there are no separate `*.types.ts` or `*.schema.ts` files, and no `utils` or `helpers`: name a file after what it does.

| File | Holds | Lives in | Required |
| --- | --- | --- | --- |
| `<domain>.ts` | zod schemas, their `z.infer` types and the domain constants | `packages/shared/src` | one per domain |
| `routes.ts` (or `<part>-routes.ts` when it grows) | Fastify handlers of the module | `apps/api/src/modules/<module>/` | yes |
| `service.ts` | business rules used by more than one route or consumer | same | only when reused |
| `mappers.ts` | database row to shared DTO | same | optional |
| `constants.ts` | constants with 3+ items or used outside the file | same | optional |
| `errors.ts` | `HttpError` helpers (one for the whole API) | `apps/api/src` | one |
| `<Name>.tsx`, `use<Name>.ts` | component, hook | `apps/web/src` | yes |
| `services/{x, api/x, mock/x}.ts` | interface, real and mock implementation | `apps/web/src/services` | yes |
| `<file>.test.ts(x)` | test beside its source (web, shared); API tests live in `apps/api/test/` | | yes |

Enumerations are `z.enum([...])` in `packages/shared` (or `as const` for a plain list), with the type inferred from it. Do not use TypeScript `enum`: it does not derive from zod. The database enums (`pgEnum`) are built from those same schemas (`schema.enum`).

## Commits and pull requests

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) in English, e.g. `feat(video): add caption upload` or `fix: keep cues with blank lines`.
- Keep pull requests focused: one concern per PR, branched from `main`.
- Fill in the pull request template. Pull requests are squash merged, so the PR title should also be a Conventional Commit.
