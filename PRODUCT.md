# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the course creator / instructor who self-hosts.** An independent creator or small team who wants to publish recorded courses, tutorials and learning paths on infrastructure they own, instead of being locked into a closed platform. They create content, grant access and follow student progress.
- **Students:** watch lessons, take quizzes, track progress and download certificates.
- **Admins:** manage users, grants, branding, languages, video adapter, SMTP and the instance itself. Often the same person as the instructor on small instances.

Roles in the product: Student, Instructor, Admin.

## Product Purpose

An open source, self-hosted course platform. Existing open source options (Moodle, Open edX, Frappe LMS) target formal education or feel dated; creators otherwise end up on closed platforms. OpenCourse is a modern, beautiful, extensible members area that comes up with a single `docker compose up`.

Success for v1: courses delivered as video, text and files with progress, quizzes and certificates; truly multilingual interface and content; a local instance running in under 5 minutes; an architecture that accepts public contributions without touching the core.

## Positioning

Open source and self-hosted with a product experience that closed platforms usually own. Access is modeled as a **Grant** (user, course, source, expiry), fully decoupled from payment, so a future payment plugin only creates grants. Multilingual in two layers: interface strings and per-course translatable content.

## Operating Context

- Instructors work in the Studio (dashboard, tabbed course editor: Details, Content, Students, Certificate, Settings; quiz builder; grants and invites).
- Students use a home with "continue where you left off", course pages with an accordion curriculum, and a player (speed, fullscreen, captions, position resume, collapsible curriculum, personal notes).
- Admins use users, grants, settings and a plugins page.
- Video sits behind a `VideoProvider` adapter: self-hosted HLS by default, external providers (Bunny Stream, Vimeo, Cloudflare Stream) swappable.
- Self-hosting stack: Docker Compose with web, api, worker, postgres, redis, minio, mailpit.

## Capabilities and Constraints

- Frontend: React, TypeScript, Vite, Tailwind, shadcn/ui, React Router, TanStack Query, react-i18next, zod, react-hook-form. pnpm monorepo (apps/web, apps/api with its worker, packages/shared).
- No component reads data directly; everything goes through `src/services` interfaces with a mock implementation in `src/services/mock`.
- No hard-coded UI strings: everything goes through i18n, `pt-BR` and `en` first, more via community translation. Enabled languages are configured per instance.
- Course access is always a Grant. Never build price, purchase or payment UI. Financial integration, community, gamification, affiliates and a native app are out of scope for v1.
- Styles use logical properties (`ms`, `me`, `ps`, `pe`) for future RTL.
- Dates, numbers and time zones per user via `Intl`.
- Honest limitation to state in docs: download protection with self-hosted video is limited.
- Current state: the frontend runs fully mocked (demo mode) or against the real API for everything except settings; student area, instructor studio and admin area exist. See the README for the backend status.

## Brand Commitments

- Working name "OpenCourse".
- Olive green `#2f6f5e`, background `#f4f6f2`, an equivalent dark theme, everything as CSS variables (from the project conventions).
- Code comments and all documentation in English; the project is public.

## Evidence on Hand

- Full specification in `docs/PRD.md`.
- No real customers, testimonials, benchmarks or usage data exist. Future work must not fabricate them.

## Product Principles

1. **Grant, not purchase.** Access is a relationship between a user and a course, never a transaction in the UI.
2. **Multilingual by construction.** Interface and content are both translatable; nothing is hard-coded to one language.
3. **Decoupled and extensible.** Frontend goes through services, video through an adapter, integrations through events and plugins, so contributions never need to touch the core.
4. **Easy to host, easy to start.** Local instance in under 5 minutes; a creator should never need infrastructure expertise to feel the product working.
5. **Honest about limits.** Say plainly what self-hosting cannot guarantee (for example video download protection).

## Accessibility & Inclusion

No formal standard established yet. RTL readiness (logical properties) and full pt-BR/en coverage are binding. Mobile layouts have been verified down to 375px.
