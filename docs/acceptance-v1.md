# PRD v1 acceptance: criteria 3 and 4

Verified on 2026-10-22 against `main` at `7da8f67` plus the tests added with this document.

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
| A plugin can create grants through `POST /grants` | `apps/api/src/modules/grants/routes.ts` | Partial: possible only by logging in as a user (gap below) |

The wording scan covers the product roots (`apps/api/src`, `apps/api/migrations`, `apps/web/src`, `packages/shared/src`). It skips `apps/docs`, which mentions the absence of payment on purpose, and test files. The wording regex is deliberately broad; if it ever flags a legitimate word, fix the word rather than allowlisting.

### Gap: no machine credential for plugins

`POST /grants` requires a session of someone who manages the course (an admin or the owning instructor), and sessions are httpOnly cookies issued by the e-mail and password login. A server-side plugin can only call the API by logging in as a user, so there is no scoped, revocable API key or service account yet. This does not break the criterion (the only way in is still the API), but it makes real plugins awkward. It is recorded here, not fixed: a token scheme is a design decision for a later milestone.
