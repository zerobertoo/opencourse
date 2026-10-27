# Changelog

All notable changes to OpenCourse. Releases are tagged `vX.Y.Z`; the PRD in [docs/PRD.md](docs/PRD.md) describes the original intent.

## Unreleased

## 1.0.0 (2026-10-27)

First stable release. The PRD v1 success criteria are verified in [docs/acceptance-v1.md](docs/acceptance-v1.md). Changes since [v0.1.1](https://github.com/zerobertoo/opencourse/compare/v0.1.1...v1.0.0).

### Upgrading from 0.1.x

- **PostgreSQL 18 and Redis 8.** The bundled compose files moved from `postgres:17-alpine` and `redis:7-alpine`. The Postgres data directory now lives under a versioned subdirectory of `/var/lib/postgresql`, so an existing 17 volume cannot be reused as is: dump it (`pg_dump`) before upgrading and restore into the new volume, or keep pinning the old image. Instances that run their own Postgres and Redis (`compose.app.yaml`) are not affected.
- Migrations are additive only.
- Playback addresses issued before this release stop working (they now carry the session); a lesson that was already open needs a reload.

### Added

- Uploaded videos are encrypted (AES-128 HLS) and the key is served only to a signed-in student with access. An optional student watermark (Admin → Settings → Video, off by default) is shown a few seconds out of every 30. Videos uploaded before this release are encrypted only when re-encoded.
- Google Drive video links are resolved by a new provider plugin.
- An account plays one uploaded video at a time: the newest `play` wins and the other device pauses. On by default, switchable under Admin → Settings → Video; instructors and admins are exempt.
- Settings → Signed-in devices: students see where their account is signed in and sign out the devices they do not recognise.
- `API_DOCS_ENABLED=false` hides the API reference (`/docs`) and the OpenAPI document; both stay on by default.

### Changed

- Playback addresses issued before this change stop working (they now carry the session): a lesson that was already open needs a reload.
- The OpenAPI document now carries the real version, the cookie and API key security schemes, the CSRF header and the standard error responses.
- Route chunks load lazily, shared components were extracted and touch targets are larger.
- Webhook destinations on private networks are refused when the endpoint is saved, not only on delivery.

### Fixed

- Module titles can be set per language when creating a module, and the missing-translation warning clears.
- A passed quiz lesson stays completed and the undo button is hidden.
- Saving a broken quiz in a published course is refused.
- Videos stuck in `processing` without a job are requeued by the worker.
- Settings reject unknown keys and non-http logo URLs, and accept the `Name <e-mail>` sender format.
- A wrong CSRF header value is told apart from a missing header; refused API key attempts are logged.
- Sign-in shows the invalid credentials message; dates, page titles, list column widths and a few texts are consistent across screens.
- Node versions patched for the Brotli CVE-2026-111497 are required.

### Known gaps

- A poster that failed once is not regenerated.
- No server-side certificate PDF (rendered on the client).

## 0.1.1 (2026-10-22)

Changes since [v0.1.0](https://github.com/zerobertoo/opencourse/compare/v0.1.0...v0.1.1).

### Added

- API keys for plugins: admins create them under `/admin/api-keys`; a key works only on the grant routes, acts as its creator and creates grants with the source `plugin`.
- Audit entries for grants created, extended or revoked with an API key carry its id (`apiKeyId` in the metadata). Older entries stay attributed to the creator admin only.
- Admin screen for API keys (Administration → API keys): list, create with the token shown once, and revoke.

- Documentation site (Starlight, English and Portuguese) published next to the live demo.
- Course cover image upload (presigned upload, stable public cover address, cleanup on replace or remove).
- Platform settings stored in the database and edited by admins, including SMTP (the password stays in `SMTP_PASSWORD`).
- App-only compose setup (`compose.app.yaml`) for instances that already run Postgres, Redis and S3-compatible storage, plus `pnpm infra` for development.
- Link to the GitHub repository on the sign-in screens.
- Acceptance checks for PRD v1 criteria 3 and 4 ([docs/acceptance-v1.md](docs/acceptance-v1.md)).

### Changed

- The README is short; the detailed guides live in the documentation site.

### Known gaps

- Failed-videos list is capped at 100 without an indicator.
- A poster that failed once is not regenerated.
- No server-side certificate PDF (rendered on the client).

## 0.1.0 (2026-10-18)

First public pre-release: accounts, roles and invites, courses with modules, lessons and translations, access grants, progress, graded quizzes, notes, certificates, outbound webhooks, video upload with HLS transcoding, lesson attachments and captions. The frontend runs fully mocked (demo mode) or against the real API; settings were still mocked.
