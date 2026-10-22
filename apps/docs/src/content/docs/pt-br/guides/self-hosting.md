---
title: Auto-hospedagem
description: Rode o OpenCourse com Docker Compose.
---

## Requisitos

- Docker com Compose.
- Um domínio e HTTPS para uma instalação real (atrás de HTTPS os cookies são `Secure`).

## Stack completa

```bash
git clone https://github.com/zerobertoo/opencourse.git
cd opencourse
cp .env.example .env
# troque o AUTH_SECRET, por exemplo pela saída de: openssl rand -base64 48
docker compose up -d --build
curl localhost:3000/health
```

O compose aplica as migrações e depois sobe a API e o worker. A primeira conta criada em uma instância vira admin; as seguintes começam como alunos.

| Serviço  | URL                                   | Observações                                     |
| -------- | ------------------------------------- | ----------------------------------------------- |
| API      | http://localhost:3000                 | Referência OpenAPI em `/docs`                   |
| Mailpit  | http://localhost:8025                 | recebe todo e-mail enviado em desenvolvimento   |
| Storage  | http://localhost:9001/rustfs/console/ | API S3 na porta 9000, bucket `opencourse`       |
| Postgres | localhost:5432                        | usuário, senha e banco `opencourse`             |
| Redis    | localhost:6379                        |                                                 |

Todas as credenciais acima são padrões de desenvolvimento. Troque todas antes de uma instalação real.

## Seu próprio Postgres, Redis e storage

Se você já mantém esses serviços, use a instalação só do app:

```bash
cp .env.external.example .env.external
docker compose --env-file .env.external -f compose.app.yaml up -d --build --wait
```

Ela roda as migrações, a API, o worker e o web, e lê todas as conexões de `.env.external`. Use endereços que os contêineres alcancem (não `localhost`), crie o bucket você mesmo e libere a origem do seu web no CORS dele (veja [Vídeo](../video/)). O app web grava o endereço da API (`VITE_API_URL`) no bundle durante o build.

## Configurações importantes em produção

| Variável                          | Por quê                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                     | Assina os tokens de acesso. A API recusa iniciar em produção com o valor de exemplo.            |
| `COOKIE_SECURE=true`              | Ative quando a API for servida por HTTPS.                                                       |
| `TRUST_PROXY=true`                | Só atrás de um proxy reverso seu, para o rate limit enxergar o IP real do cliente.              |
| `CORS_ORIGINS`, `WEB_BASE_URL`    | O endereço do seu web: CORS e links dos e-mails.                                                |
| `S3_PUBLIC_URL`                   | Onde os navegadores acessam o storage. Uploads e segmentos de vídeo vão direto para ele.        |
| `SMTP_*`                          | E-mail de verdade para convites, recuperação de senha e certificados.                           |
| `WEBHOOKS_ALLOW_PRIVATE_NETWORKS` | Deixe `false`, a menos que o receptor esteja na sua rede e você confie em todos os admins.      |

## Dados de demonstração

```bash
ALLOW_DEMO_SEED=true node dist/seed-demo.js            # carrega
ALLOW_DEMO_SEED=true node dist/seed-demo.js --remove   # desfaz
```

Rode dentro do contêiner `api`. Ele cria contas que compartilham uma senha pública, então use apenas em um servidor descartável.
