---
title: Arquitetura
description: Como as peças se encaixam.
---

O OpenCourse é um monorepo pnpm.

| Pacote            | O que é                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React, Vite, Tailwind. Lê dados apenas por `src/services`, que pode rodar com mocks no navegador.        |
| `apps/api`        | Fastify, Drizzle, Postgres. A segunda entrada, `src/worker.ts`, é o worker em segundo plano.             |
| `packages/shared` | Tipos e schemas zod: o contrato entre web e API e a origem do documento OpenAPI.                         |

## Contrato primeiro

Os schemas de requisição e resposta ficam em `packages/shared` como zod e são usados pelas rotas. A referência OpenAPI (em `/docs` na API) é gerada a partir deles, e todo erro usa um único schema compartilhado.

## Acesso é uma concessão

O aluno só chega a um curso por uma concessão (grant): ela tem uma origem (`manual`, `invite`, ...), uma validade opcional e pode ser revogada. Não existe código de preço, compra ou pagamento. Um plugin futuro que venda cursos cria concessões pela API ou reage aos eventos.

## Eventos e o worker

Mudanças de estado gravam um evento de domínio na tabela `outbox_events`, na mesma transação que as causa, então o evento existe exatamente quando a mudança existe. O worker consulta o outbox, cria um job BullMQ por consumidor e marca o evento como despachado.

| Evento                | Gravado quando                                    |
| --------------------- | ------------------------------------------------- |
| `user.created`        | uma conta é criada ou um convite é aceito         |
| `enrollment.granted`  | uma concessão é criada, ou muda de validade (`extended: true`) |
| `grant.revoked`       | uma concessão é revogada (uma vez)                |
| `lesson.completed`    | um aluno conclui uma aula                         |
| `course.completed`    | um aluno conclui a última aula de um curso        |
| `certificate.issued`  | um certificado é emitido                          |
| `video.processed`     | um vídeo enviado terminou de ser codificado       |

O worker (`apps/api/src/worker.ts`, mesma imagem da API, `node dist/worker.js`) consulta o outbox cerca de uma vez por segundo, e as linhas já despachadas são apagadas após 7 dias. Os consumidores ficam em `src/worker/consumers.ts`. Um job que falha é repetido 5 vezes com espera exponencial e depois guardado para inspeção.

A entrega é pelo menos uma vez, então os consumidores precisam ser idempotentes. Sem o worker rodando nada se perde: os eventos esperam no outbox. Consumidores atuais: certificados e seu e-mail, [webhooks](../webhooks/) e o codificador de vídeo.

## Pontos de extensão

- **Provedores de vídeo.** Os links são resolvidos por `VideoProviderPlugin`s listados em um registro. Veja [Vídeo](../video/#escrevendo-um-plugin-de-provedor).
- **Eventos e webhooks.** Assine de fora com [webhooks](../webhooks/) ou adicione um consumidor em `apps/api/src/worker/consumers.ts`.
- **Acesso.** Crie concessões pela API.

## Internacionalização

A interface usa react-i18next com namespaces `pt-BR` e `en`, e um teste falha quando um idioma perde uma chave ou um argumento ICU. O conteúdo dos cursos é traduzido por curso, com fallback quando falta uma tradução.
