---
title: Desenvolvimento
description: Rode os apps, os dados de demonstração e os testes.
---

As regras de contribuição estão no [CONTRIBUTING](https://github.com/zerobertoo/opencourse/blob/main/CONTRIBUTING.md). Esta página trata de como rodar as coisas.

## Trabalhando na API

Suba só os serviços de dados e rode os apps com hot reload:

```bash
pnpm infra                                 # Postgres, Redis, storage (bucket incluído) e Mailpit
pnpm --filter @opencourse/api db:migrate
pnpm --filter @opencourse/api dev
pnpm --filter @opencourse/api dev:worker   # em outro terminal: certificados e e-mails dependem dele
pnpm --filter @opencourse/api test
```

Depois de mudar uma tabela em `apps/api/src/db/schema`, rode `pnpm --filter @opencourse/api db:generate` e faça o commit do novo SQL em `apps/api/migrations`.

## Rodando o web contra a API real

```bash
cp apps/web/.env.example apps/web/.env.local   # define VITE_API_URL=http://localhost:3000
docker compose up -d --build --wait
pnpm --filter @opencourse/web dev
```

Sem `VITE_API_URL` o app fica em modo demo: o login simulado aceita qualquer credencial, os botões "entrar como aluno, instrutor ou admin" abrem dados prontos, e o estado fica no `sessionStorage`.

Com ela, os botões de demo somem e o mock começa vazio, com chaves de armazenamento próprias para que dados de demo e dados reais nunca se misturem. Tudo vai para a API (inclusive as configurações: marca, idiomas e servidor de e-mail ficam salvos no banco, e a senha do SMTP continua em `SMTP_PASSWORD`); só o usuário logado é espelhado no mock. Um instrutor novo começa com o Studio vazio: crie cursos lá, ou carregue os dados de demonstração abaixo.

## Autenticação

As sessões usam dois cookies httpOnly: um token de acesso de curta duração e um token de renovação rotativo (limitado a `/api/v1/auth`).

- Requisições que alteram estado precisam enviar o cabeçalho `x-requested-with: opencourse` (defesa contra CSRF).
- Login e recuperação têm limite de requisições de três formas: por IP do cliente, por conta e por par (IP, conta), de modo que nem um IP varrendo muitas contas nem muitos IPs martelando uma conta passam.
- Os tokens de convite são mascarados nos logs de requisição.
- Atrás de HTTPS defina `COOKIE_SECURE=true`. Atrás de um proxy reverso defina `TRUST_PROXY=true` para o limite enxergar o IP real do cliente.
- Os e-mails de recuperação de senha e de convite vão para o Mailpit em desenvolvimento.

## Dados de demonstração no banco real

```bash
pnpm --filter @opencourse/api db:seed:demo
```

Cria quatro contas (`admin@`, `instructor@`, `student@` e `student2@opencourse.example`, todas com a senha de desenvolvimento `demo-password-123`), três cursos (dois publicados, um rascunho) e algumas concessões (ativa, a expirar, expirada e revogada). Pode rodar de novo com segurança: contas e cursos existentes nunca são sobrescritos. Ele se recusa a rodar com `NODE_ENV=production`, a menos que `ALLOW_DEMO_SEED=true` esteja definido, só para um servidor de teste descartável.

Rode o mesmo script com `--remove` para desfazer. Isso apaga os cursos e as contas de demo (e suas concessões, progresso e certificados) e nada além disso, e falha sem alterar nada se dados reais ainda apontarem para uma conta de demo.

Em uma stack publicada, o script compilado está na imagem da API: abra um terminal no contêiner `api` e rode `ALLOW_DEMO_SEED=true node dist/seed-demo.js` (acrescente `--remove` para desfazer).

## Testes

- `pnpm test` roda os testes unitários e de integração da API. Os testes da API usam um banco próprio `<database>_test` no Postgres do Compose, nunca o de desenvolvimento, e precisam de Postgres, Redis, do storage e do `ffmpeg`.
- `pnpm --filter @opencourse/api test:e2e` roda os testes de ponta a ponta contra a stack do Compose em execução: contas, a jornada completa do curso, links de e-mail pelo Mailpit, webhooks e resiliência.
  - Suba a stack com `RATE_LIMIT_DISABLED=true`, porque a suíte cadastra mais contas do que o limite de 10 cadastros por hora permite (o CI faz o mesmo), e com um `AUTH_SECRET` seu.
  - A primeira conta de uma instância é o admin, então os fluxos que precisam de um rodam só em banco novo; nos demais eles se pulam sozinhos (`docker compose down -v` apaga os volumes locais).
  - Defina `E2E_API_URL` para apontar os testes para outra API. O arquivo de resiliência para serviços do Compose, então rode só `e2e/auth` e `e2e/courses` assim.
