# PRD: OpenCourse (working name)

Open source, self-hosted platform for creators to publish recorded courses, tutorials and learning paths.

> This is the original specification. It states the intent and scope; where the implementation differs, the [documentation](https://zerobertoo.github.io/opencourse/docs/) and the guides in this folder describe the current state (for example, domain events go through a transactional outbox instead of an in-process bus, and video providers are plugins).

## 1. Vision and goals

**Problem:** existing open source options (Moodle, Open edX, Frappe LMS) are designed for formal education or have a dated product experience. Course creators end up locked into closed platforms.

**Vision:** a modern, beautiful, extensible members area that can be hosted with a single `docker compose up`.

**v1 goals**

* Deliver courses as video, text and files, with progress, quizzes and certificates.
* Truly multilingual: interface and content.
* Access modeled as a grant, decoupled from payment.
* An architecture that accepts public contributions without touching the core.
* Bring everything up locally in under 5 minutes.

**Out of scope for v1:** financial integration (checkout, instant payments, subscriptions), community, gamification, affiliates, native app.

## 2. Roles

* **Student:** watches lessons, takes quizzes, tracks progress, downloads certificates.
* **Instructor:** creates and manages their courses, grants access, follows students.
* **Admin:** manages users, access, branding and instance settings.

## 3. Architecture principles

1. **Grant instead of purchase.** Course access is always a grant (user, course, source, expiry). In v1 the source is manual or invite; a future payment plugin only creates grants.
2. **Two-layer i18n.** Interface strings and the translatable content of each course.
3. **Video behind an interface (adapter).** Self-hosted by default, external providers swappable.
4. **Domain events.** Everything relevant emits an event; this is how plugins and integrations plug in.
5. **Frontend decoupled through `services`.** No component accesses data directly.
6. **Contract first.** zod schemas shared between API and web; OpenAPI generated automatically.

## 4. Stack and structure

* **Monorepo:** pnpm workspaces + Turborepo.
* **web:** React, TypeScript, Vite, Tailwind, shadcn/ui, React Router, TanStack Query, react-i18next, zod, react-hook-form.
* **api:** Node.js, TypeScript, Fastify, Drizzle ORM, zod, OpenAPI via `@fastify/swagger`.
* **worker:** BullMQ for transcoding, e-mails and certificate issuing (a second entrypoint of `apps/api`, same image).
* **Data:** PostgreSQL, Redis, S3-compatible storage (RustFS in the Compose stack).
* **Video:** ffmpeg producing HLS in multiple qualities.
* **E-mail:** configurable SMTP (Mailpit in development).
* **Deploy:** Docker Compose (api, worker, postgres, redis, storage, mailpit).

```
apps/
  web/        # frontend
  api/        # Fastify API (src/worker.ts is the background worker)
packages/
  shared/     # types, zod schemas, events, video provider plugins
docs/         # specification and guides
```

## 5. Data model

* **users:** id, name, email, password (argon2), avatar, role, language, time zone, active, timestamps.
* **courses:** id, slug, status (draft, published, archived), cover, instructor, default language, required sequential order (bool).
* **course_translations:** course_id, language, title, description, what you will learn.
* **modules / module_translations:** order, title per language.
* **lessons / lesson_translations:** type (video, text, file, quiz), order, duration, title and content per language.
* **lesson_assets:** attached files, videos (with processing status), captions per language.
* **quizzes, questions, options:** multiple choice, explanation, minimum score.
* **quiz_attempts:** user, answers, score.
* **grants:** user_id, course_id, source (manual, invite, plugin), created by, expires at (null means lifetime), status (active, revoked, expired).
* **invites:** email, optional course, token, expiry, status.
* **progress:** user_id, lesson_id, completed, video position, updated at.
* **certificates / certificate_templates:** public verification code, issued at, template per course.
* **settings:** branding, enabled languages, video adapter, SMTP.
* **api_tokens:** for future integrations (for example, a payment plugin creating grants).
* **audit_log:** who did what (grants, revocations, role changes).

## 6. v1 features

### Authentication and access

* Sign-up, sign-in, password recovery, invite by link.
* Session with httpOnly cookie and refresh; social login and OIDC as an adapter (may land right after v1).
* RBAC: admin, instructor, student. Routes protected with a friendly 403.

### Content

* Courses, modules and lessons with drag-and-drop reordering.
* Video lesson (own upload with HLS, or external provider link), Markdown text, downloadable files, quiz.
* Captions per language.
* Optional sequential order: the next lesson only unlocks after completing the previous one.

### Student

* Home with "continue where you left off" and my courses.
* Course page with an accordion curriculum and status per lesson.
* Player with speed, fullscreen, captions, position resume, collapsible side curriculum, personal notes.
* Quizzes with feedback and minimum score.
* PDF certificates with a public verification page.
* Settings: profile, language, time zone, theme, password, notifications.

### Instructor (Studio)

* Dashboard with metrics (active students, published courses, completion rate).
* Tabbed course editor: Details (content per language with an incomplete-translation indicator), Content, Students, Certificate, Settings.
* Grant access (manual, with expiry or lifetime) and send invites.
* Quiz builder.

### Admin

* Users: search, filters, change role, deactivate, invite.
* Grants: global list, revoke, extend expiry.
* Settings: branding, languages, video adapter, SMTP.
* Plugins page (placeholder listing future extensions).

## 7. Video and storage

`VideoProvider` interface: `createUpload`, `getStatus`, `getPlaybackUrl`, `delete`.

* **`local` adapter (default):** upload to the S3-compatible storage; the worker transcodes to HLS (360p, 720p, 1080p depending on the source); signed, expiring playback URLs.
* **External adapters:** Bunny Stream, Vimeo, Cloudflare Stream (just store the identifier and generate the embed).
* Processing status (uploading, processing, ready, error) visible in the editor.
* Honest note: download protection with self-hosting is limited. The documentation must say so and recommend external adapters for anyone who needs strong protection.

## 8. i18n

* **Interface:** react-i18next with ICU message format, namespaces per area, `pt-BR` and `en` at first, community translations through Weblate.
* **Content:** translation tables per entity, with a fallback chain (user language, then course default language).
* Dates, numbers and time zone per user via `Intl`; styles with logical properties (`ms-`, `me-`, `ps-`, `pe-`) to support RTL in the future.
* Languages enabled per instance, configured by the admin.

## 9. API (summary)

Versioned REST under `/api/v1`, documented with OpenAPI.

* `auth`: register, login, logout, refresh, forgot, reset, accept invite.
* `courses`, `modules`, `lessons`: CRUD with translations; batch reordering.
* `me/courses`, `me/progress`, `me/certificates`.
* `lessons/:id/progress`, `quizzes/:id/attempts`.
* `grants`, `invites`: create, list, revoke, extend.
* `videos/uploads`: start upload, check status.
* `admin/users`, `admin/settings`, `admin/audit`.
* `certificates/verify/:code`: public.

## 10. Domain events and extensibility

Typed events (`user.created`, `enrollment.granted`, `grant.revoked`, `lesson.completed`, `course.completed`, `certificate.issued`, `video.processed`) written to a transactional outbox and relayed by the worker to its consumers.

* Outbound webhooks configurable by the admin (URL, events, HMAC secret).
* API tokens with scopes for inbound integrations (a future payment plugin creates grants through here).
* Video provider plugins with a documented contract (see [video.md](video.md)); a general plugin system may follow.

## 11. Security and operations

* Passwords with argon2, rate limiting on login and recovery, upload validation (type and size), restricted CORS, security headers.
* Authorization by role and by grant checked on the server for every content read.
* Audit of administrative actions.
* Structured logs (pino), `/health` endpoint, versioned migrations, documented backup.
* GDPR/LGPD: account export and deletion by the user.

## 12. Frontend: screen specification

### 12.1 Frontend technical requirements

* React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, zod and react-hook-form.
* **i18n with react-i18next**, languages `pt-BR` and `en`. No hard-coded strings in components. Dates and numbers via `Intl`, respecting the user's language and time zone.
* Styles with logical properties to support RTL in the future.
* Light and dark theme, mobile first, accessible (keyboard, visible focus, AA contrast).

### 12.2 Data layer

No component accesses mocked data directly. All access goes through interfaces in `src/services/` (courses, enrollments, progress, users, access grants, authentication, settings), with mock implementations in `src/services/mock/` (in-memory data, simulated latency). A single file decides which implementation to use, so the mock can be replaced by a real API without changing the screens.

Entities live in `packages/shared/src/entities.ts` (zod schemas and inferred types shared with the future API): `User` (name, email, avatar, role, language, time zone), `Course` (slug, status, cover, instructor), `CourseTranslation` (language, title, description, what you will learn), `Module`, `Lesson` (type video, text, file or quiz; titles and content per language; captions per language), `Quiz`, `Grant` (user, course, source manual, invite or plugin, expiry or lifetime, status), `Progress`, `Certificate`.

Course access is always a **grant (Grant)**. The interface never mentions purchase, price or checkout.

### 12.3 Visual direction

Editorial and clean, with plenty of white space. Plain graphite neutrals (light background `#f6f7f8`, equivalent dark variant) and a single hue: the olive green accent `#2f6f5e`, which the admin can override per instance. Sans-serif for headings and body (Inter), monospace for numbers, durations and labels. Everything in CSS variables (design tokens); see `DESIGN.md`. Logo and platform name are placeholders.

### 12.4 Screens

#### Authentication

Sign-in, sign-up, forgot password, reset password and accept invite. Visible language selector. The mocked sign-in accepts any credentials, with "sign in as student, instructor or admin" buttons for testing.

#### Student

* **Home:** "continue where you left off", my courses as cards with progress, recent certificates.
* **Course page:** cover, description, instructor, duration, what you will learn, accordion curriculum per module with an icon per lesson type and status.
* **Lesson player:** video with speed, fullscreen and captions per language; collapsible side curriculum; Description, Materials and Notes tabs; previous lesson, mark as completed and next buttons. A text lesson renders Markdown; a file lesson lists downloads; a full quiz with feedback and score.
* **Certificates:** list with preview and download (mocked).
* **Settings:** profile, language, time zone, theme, password.

#### Instructor (Studio)

* **Dashboard:** metric cards (active students, published courses, completion rate) and course list.
* **Course list:** search, status filter, new course.
* **Course editor** in tabs:
  * **Details:** title and description per language, with language tabs and an incomplete-translation warning.
  * **Content:** modules and lessons with drag and drop, side editing panel per lesson type, including the quiz builder.
  * **Students:** list with progress, grant access and send invite.
  * **Certificate:** template with preview.
  * **Settings:** visibility, sequential lesson order, archive.

#### Admin

* **Users:** table with search, role filter, edit, deactivate, invite.
* **Grants:** global list with filters, revoke and extend expiry.
* **Settings:** branding (name, logo, colors), enabled and default languages, transactional e-mail (mocked form).

#### Navigation

Student: topbar with search, language, theme and user menu. Instructor and admin: collapsible sidebar with switching between areas according to role. Routes protected by role, with 403 and 404 screens.

### 12.5 UX states

Every screen has a loading skeleton, an empty state with a CTA and an error state with "try again". Toasts for actions, confirmation for destructive actions, inline validation in forms.

### 12.6 Mocked data

A few fictional courses and users in Portuguese, with at least one course fully translated into English and another partially translated. Each course has several modules and lessons of varied types. State persists for the session (marking a lesson as completed updates the progress).

### 12.7 Frontend acceptance criteria

1. The three roles navigate through all screens without errors.
2. Switching between `pt-BR` and `en` changes the whole interface without reloading and without hard-coded strings in the code.
3. All data access goes through `services`; replacing the mock with another implementation does not require touching components.
4. Light and dark themes work on all screens.
5. All screens work at 375 px width.
6. No screen mentions price, purchase or payment.

## 13. Quality and public contribution

* **Tests:** Vitest (unit and API integration), Playwright (main flows: sign in, watch a lesson, grant access).
* **CI (GitHub Actions):** lint, typecheck, tests, build, end-to-end on the Compose stack and Docker image build.
* **Conventional commits**; an automatic changelog (release-please or changesets) is still to do.
* **Repository:** README with quickstart, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and PR templates, `good first issue` labels.
* **License:** AGPL-3.0 (prevents closed hosting without giving code back).
* **Docs:** Starlight or Docusaurus, translated, with a self-hosting guide, architecture and plugin authoring.

## 14. Implementation milestones

1. **Mocked frontend** and interface review.
2. **Foundation:** monorepo, Docker Compose, CI, shared schemas, migrations.
3. **Auth, RBAC, users and invites.**
4. **Courses, modules, lessons and translations** (API and Studio integration).
5. **Grants, enrollments, progress and quizzes.**
6. **Video pipeline** (local adapter with HLS) and real player.
7. **Certificates, e-mails and events/webhooks.**
8. **Complete i18n, docs and polish.**
9. **Public opening of the repository** with a stable core.

## 15. v1 success criteria

1. `docker compose up` brings up the complete, working platform.
2. An instructor creates a course with video, text and quiz, grants access, and the student completes it and downloads the certificate.
3. Switching the language changes interface and content without reloading, with a correct fallback when a translation is missing.
4. No v1 flow depends on payment, and a future plugin can create grants only through the API or events.
5. An outside contributor can run, test and open a PR following only CONTRIBUTING.
