# OpenCourse

Open source, self-hosted course platform. Full specification in [docs/PRD.md](docs/PRD.md).

Current state: fully mocked frontend (`apps/web`), no backend yet.

## Requirements

- Node 20 or newer (`.nvmrc` pins 22)
- pnpm 9

## Commands

```bash
pnpm install
pnpm dev        # development server
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Demo

The mocked login accepts any credentials. On the sign-in screen, the "sign in as student, instructor or admin" buttons open the app with ready-made demo data. The state lives in `sessionStorage` and is reset when the tab is closed.

## Structure

- `apps/web`: frontend (React, Vite, Tailwind, react-i18next)
- `packages/shared`: shared types and zod schemas

## Contributing

- Code, comments and documentation are written in English.
- UI text always goes through i18n (`pt-BR` and `en`); there are no hard-coded strings in components.
- Components never read data directly: everything goes through the interfaces in `apps/web/src/services`.
