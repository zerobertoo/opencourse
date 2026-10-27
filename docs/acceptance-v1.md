# PRD v1 acceptance

Criteria 1, 2 and 5 were verified on 2026-10-27 against `main` at `d6e71a3` on a clean checkout. Criteria 3 and 4 were verified on 2026-10-22 and are guarded by automated tests that still run in CI.

## Criterion 1: one command brings up the platform

> `docker compose up` brings up the complete, working platform.

| Check | Result |
| --- | --- |
| `docker compose down -v`, then `docker compose --env-file .env.example up -d --build --wait` with `AUTH_SECRET` set: postgres, redis, storage, mailpit, migrate, storage-init, api, worker and web all end healthy or exited 0 | Pass |

## Criterion 2: instructor to certificate

> An instructor creates a course with video, text and quiz, grants access, and the student completes it and downloads the certificate.

| Check | Result |
| --- | --- |
| End-to-end suite against that stack (`pnpm --filter @opencourse/api test:e2e`, rate limit disabled): 18 passed, 1 skipped, including the full journey with a provider video lesson | Pass |

The certificate PDF is rendered on the client, so the download itself is not covered by the API suite.

## Criterion 5: outside contributor

> An outside contributor can run, test and open a PR following only CONTRIBUTING.

| Check | Result |
| --- | --- |
| Fresh clone, `pnpm install --frozen-lockfile`, `pnpm lint`, `tsc --noEmit` in api, web and shared: clean | Pass |
| Fresh clone tests with the data stack up: shared 140, api 384, web 522 passed | Pass |

Three web tests (the demo video player) timed out once when turbo ran every package in parallel and passed when the web suite ran alone; they are load-sensitive, not failing.

# Criteria 3 and 4

## Criterion 3: language switching

> Switching the language changes interface and content without reloading, with a correct fallback when a translation is missing.

| Check | Where | Result |
| --- | --- | --- |
| pt-BR and en have the same keys and ICU arguments, no empty messages | `apps/web/src/i18n/i18n.test.ts` | Pass (automated) |
| `resolveTranslation` returns the requested locale, else the course default, else `null`, and flags the fallback | `packages/shared/src/content.test.ts` | Pass (automated) |
| Interface and course content change in place when the selector changes; the rendered heading node survives (no remount) | `apps/web/src/pages/student/language-switch.test.tsx` | Pass (automated) |
| A course with no English translation shows the default-language content plus the fallback notice | `apps/web/src/pages/student/language-switch.test.tsx` | Pass (automated) |
| `LanguageSwitcher` calls `i18n.changeLanguage`; there is no `location.reload` or navigation in the path | code read: `components/LanguageSwitcher.tsx` | Pass (manual) |

Not covered: the lesson player has the same fallback notice (`lesson.fallbackNotice`) but no test renders it. The logic is shared with the course page through `localizeLesson`.

## Criterion 4: no payment dependency

> No v1 flow depends on payment, and a future plugin can create grants only through the API or events.

| Check | Where | Result |
| --- | --- | --- |
| No price, purchase, payment, checkout or billing wording in API source, schema, migrations, web source or UI strings (pt-BR and en) | `apps/api/test/no-payment.test.ts` | Pass (automated) |
| No payment SDK in any `package.json` | `apps/api/test/no-payment.test.ts` | Pass (automated) |
| Course access is always a `Grant`; no other path to course content | `apps/api/src/modules/grants`, `invites`, `enrollments` (code read) | Pass (manual) |
| Domain events (`enrollment.granted`, `grant.revoked`, ...) leave through the outbox and webhooks, not an in-process bus | `apps/api/src/modules/webhooks`, `worker/consumers.ts` (code read) | Pass (manual) |
| A plugin can create grants through `POST /grants` | `apps/api/src/modules/grants/routes.ts`, `apps/api/test/api-keys.test.ts` | Pass (automated), with an API key |

The wording scan covers the product roots (`apps/api/src`, `apps/api/migrations`, `apps/web/src`, `packages/shared/src`). It skips `apps/docs`, which mentions the absence of payment on purpose, and test files. The wording regex is deliberately unanchored so identifiers such as `coursePrice` are caught (only "striped" and "stripes" are exempt); if it ever flags a legitimate word, fix the word rather than allowlisting. The SDK check covers dependencies, dev, optional and peer dependencies of every workspace package.

### Resolved gap: machine credential for plugins

Until the API keys landed, a plugin could only call `POST /grants` by signing in as a user. Admins now create keys (`/admin/api-keys`) that work only on the grant routes and act as their creator; see the courses and access guide. They are managed on the admin screen "API keys".
