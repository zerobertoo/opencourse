---
title: Learning and certificates
description: Progress, quizzes, notes and certificates.
---

Tags `progress`, `me`, `studio` and `certificates` in the OpenAPI reference.

## Progress

`PUT /lessons/:id/progress` marks a lesson completed (or not) and saves the video position. `GET /courses/:id/progress` lists the caller's records. Only people who can read the course may write.

- In courses with sequential order the server refuses to complete, save a position or take a quiz on a locked lesson.
- Video lessons complete only when the client asks (the player decides when, for instance at about 90%). Players embedded from a provider report no position, so students mark those lessons themselves.
- Quiz lessons complete only by passing.

## Quizzes

`POST /quizzes/:lessonId/attempts` grades on the server.

- The student never receives `isCorrect`, only per-question feedback after submitting. The right option is revealed only once the attempt passed.
- Attempts are unlimited and all are kept. The pass mark is the quiz's own, and passing completes the lesson for good.

## Enrollments and the dashboard

`GET /me/courses` lists active grants (archived courses included) with a progress summary, and `GET /me/continue-learning` points to the next lesson with the saved video position. Managers get `GET /courses/:id/students` and `GET /studio/metrics` (active students, completion rate).

## Notes

`GET` and `PUT /lessons/:id/note`. Notes are private to their author, and blank text erases the note.

## Certificates

Finishing a course, with the course certificate template enabled, issues one certificate per student and course, forever.

- The holder name, course titles and template are copied into the row, so later edits never change a verifiable certificate.
- Repeated `course.completed` events are harmless (`UNIQUE (user_id, course_id)` and `ON CONFLICT DO NOTHING`), and only the insert that wins records `certificate.issued`.
- The worker issues it right after the course is completed (up to about a second later) and e-mails the student, with retries. `email_sent_at` is set once the e-mail went out. A crash between sending and recording can mail twice.
- `GET /me/certificates` lists the caller's. `GET /certificates/verify/:code` is public and rate limited, answers the same 404 for malformed and unknown codes, and exposes no e-mail or ids. Codes look like `OC-XXXX-XXXX`.
- The PDF is rendered by the web client from the stored data. Names outside Latin-1 print as `?`.
- People who finished before the outbox existed get theirs with `pnpm --filter @opencourse/api certificates:backfill` (idempotent, sends no e-mail).
- There is no revocation or reissue yet.
