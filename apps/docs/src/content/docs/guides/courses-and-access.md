---
title: Courses and access
description: Who sees what, publishing and grants.
---

Course routes live under `/api/v1` and are documented in the OpenAPI reference at `/docs` on the API (tags `courses`, `curriculum` and `grants`).

## Who sees what

- Signed-in users list published courses, plus archived ones they still hold a grant for.
- Drafts answer 404 to anyone who cannot edit them, so their existence does not leak.
- The curriculum (lessons, content, video, quiz) needs an active grant, or being the course instructor or an admin. Without one the course answers 403.
- Quiz answers are removed from every response to people who cannot manage the course.

## Publishing

A course goes live only when `getPublishIssues` (in `packages/shared`) reports nothing, and a published course cannot be edited into a new problem. Links to videos and cover images must be `https`.

## Grants

Access to a course is always a grant. Instructors (for their own courses) and admins create, list, revoke and extend grants.

- A user has at most one open grant per course. Granting again extends it instead of stacking, and revoking twice is harmless.
- Accepting an invite that names a course creates the grant in the same transaction as the account.
- Revoking a grant, or letting it expire, hides the course and its progress. Nothing is deleted, and granting again brings it all back.

### API keys for plugins

A server-side plugin (for example one that sells courses elsewhere and grants access) authenticates with an API key instead of a browser session:

1. An admin creates a key under **Administration → API keys** (the screen shows the token once, with a copy button) or with `POST /api/v1/admin/api-keys` (`{ "name": "..." }`). The `token` (it starts with `oc_`) is in that response only; the database keeps just its hash.
2. The plugin sends `Authorization: Bearer <token>` plus the `X-Requested-With: opencourse` header that every state-changing request needs, to the grant routes: `GET /grants`, `POST /grants`, `POST /grants/:id/revoke` and `POST /grants/:id/extend`.
3. Grants created this way have the source `plugin`.

A key acts as the admin who created it and works only on those four routes. It stops working when that admin is deactivated or loses the role, and an admin can revoke it on the same screen or with `POST /api/v1/admin/api-keys/:id/revoke`. Keys cannot create or revoke keys. Creation and revocation are written to the audit log, and so are the grants a key creates, extends or revokes (the admin is the actor and the key id is `apiKeyId` in the metadata), and the plugin can also react to the domain events through [webhooks](../webhooks/).

## Audit

Course status changes and grant creation, extension and revocation are written to the audit log.
