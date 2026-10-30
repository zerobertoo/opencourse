---
title: Self-hosting
description: Run OpenCourse with Docker Compose.
---

## Requirements

- Docker with Compose.
- A domain and HTTPS for a real deployment (cookies are `Secure` behind HTTPS).

## Full stack

```bash
git clone https://github.com/zerobertoo/opencourse.git
cd opencourse
cp .env.example .env
# replace AUTH_SECRET, for example with the output of: openssl rand -base64 48
docker compose --profile dev up -d --build   # the dev profile adds Mailpit
curl localhost:3000/health
```

For a real deployment, drop `--profile dev` and set `SMTP_*`: Mailpit only captures e-mails, it never delivers them, and its inbox has no login.

The compose file applies the migrations, then starts the API and the worker. The first account created on an instance becomes its admin; everyone after that starts as a student.

| Service  | URL                                   | Notes                                    |
| -------- | ------------------------------------- | ---------------------------------------- |
| API      | http://localhost:3000                 | OpenAPI reference at `/docs`             |
| Mailpit  | http://localhost:8025                 | `--profile dev` only: catches every e-mail |
| Storage  | http://localhost:9001/rustfs/console/ | S3 API on port 9000, bucket `opencourse` |
| Postgres | localhost:5432                        | user, password and database `opencourse` |
| Redis    | localhost:6379                        |                                          |

Every credential above is a development default. Change all of them before a real deployment.

## Your own Postgres, Redis and storage

If you already run these services, use the app-only setup:

```bash
cp .env.external.example .env.external
docker compose --env-file .env.external -f compose.app.yaml up -d --build --wait
```

It runs the migrations, API, worker and web, and reads every connection from `.env.external`. Use addresses the containers can reach (not `localhost`), create the bucket yourself and allow your web origin in its CORS rules (see [Video](../video/)). The web app bakes the API address (`VITE_API_URL`) into the bundle at build time.

## Settings that matter in production

| Variable                          | Why                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                     | Signs access tokens. The API refuses to start in production with the placeholder.           |
| `COOKIE_SECURE=true`              | Set it when the API is served over HTTPS.                                                   |
| `TRUST_PROXY=true`                | Only behind a reverse proxy you control, so rate limits see the real client IP.             |
| `API_DOCS_ENABLED=false`          | Hides the API reference (`/docs`) and the OpenAPI document. On by default; for a password, protect `/docs` in your reverse proxy. |
| `CORS_ORIGINS`, `WEB_BASE_URL`    | Your web address: CORS and the links inside e-mails.                                        |
| `S3_PUBLIC_URL`                   | Where browsers reach the storage. Uploads and video segments go straight to it.             |
| `SMTP_*`                          | Real e-mail for invites, password recovery and certificates.                                |
| `WEBHOOKS_ALLOW_PRIVATE_NETWORKS` | Leave `false` unless a receiver is on your own network and you trust every admin.           |

## Demo data

```bash
ALLOW_DEMO_SEED=true node dist/seed-demo.js            # load
ALLOW_DEMO_SEED=true node dist/seed-demo.js --remove   # undo
```

Run it inside the `api` container. It creates accounts that share a public password, so use it only on a throwaway server.
