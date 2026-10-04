# OpenCourse

Plataforma open source e self hosted de cursos. Especificação completa em [docs/PRD.md](docs/PRD.md).

Estado atual: frontend totalmente mockado (`apps/web`), sem backend.

## Requisitos

- Node 20 ou superior (`.nvmrc` indica a 22)
- pnpm 9

## Comandos

```bash
pnpm install
pnpm dev        # servidor de desenvolvimento
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Estrutura

- `apps/web`: frontend (React, Vite, Tailwind, react-i18next)
- `packages/shared`: tipos e schemas zod compartilhados
