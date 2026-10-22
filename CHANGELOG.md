# Changelog

All notable changes to OpenCourse. Releases are tagged `vX.Y.Z`; the PRD in [docs/PRD.md](docs/PRD.md) describes the original intent.

## Unreleased

Changes since [v0.1.0](https://github.com/zerobertoo/opencourse/compare/v0.1.0...HEAD).

### Added

- API keys for plugins: admins create them under `/admin/api-keys`; a key works only on the grant routes, acts as its creator and creates grants with the source `plugin`.

- Documentation site (Starlight, English and Portuguese) published next to the live demo.
- Course cover image upload (presigned upload, stable public cover address, cleanup on replace or remove).
- Platform settings stored in the database and edited by admins, including SMTP (the password stays in `SMTP_PASSWORD`).
- App-only compose setup (`compose.app.yaml`) for instances that already run Postgres, Redis and S3-compatible storage, plus `pnpm infra` for development.
- Link to the GitHub repository on the sign-in screens.
- Acceptance checks for PRD v1 criteria 3 and 4 ([docs/acceptance-v1.md](docs/acceptance-v1.md)).

### Changed

- The README is short; the detailed guides live in the documentation site.

### Known gaps

- No admin screen for API keys yet: they are managed through the API.
- Failed-videos list is capped at 100 without an indicator.
- A poster that failed once is not regenerated.
- No server-side certificate PDF (rendered on the client).

## 0.1.0 (2026-10-18)

First public pre-release: accounts, roles and invites, courses with modules, lessons and translations, access grants, progress, graded quizzes, notes, certificates, outbound webhooks, video upload with HLS transcoding, lesson attachments and captions. The frontend runs fully mocked (demo mode) or against the real API; settings were still mocked.
