# Lesson files: captions and attachments

Instructors can attach downloadable files to any lesson and add captions to video lessons.
Both are stored in the same S3-compatible bucket as uploaded videos (see [video.md](video.md)),
and both are served only to people who can see the course content.

## Attachments

- In the Studio, open a lesson and use **Materials**. A file lesson is made of its attachments.
- The browser sends each file straight to the storage with one presigned `PUT`, then asks the
  API to confirm it. The API checks that the stored size matches what was announced.
- Any file type is accepted, up to `ATTACHMENT_MAX_BYTES` (default `52428800`, 50 MiB).
- Downloads go through `GET /api/v1/attachments/:id/download`. The API checks the course access
  and answers `{ "url": ... }` with a short-lived address that makes the browser **save** the file
  (`Content-Disposition: attachment`), so an uploaded HTML or SVG file never runs in your site.
  The web app asks for this address when the button is clicked, which lets it renew an expired
  session first.
- The upload address is signed with the announced size, so the storage refuses a body of any
  other size. Uploads that are never confirmed are dropped after 24 hours.

## Captions

- In the Studio, open a video lesson and use **Captions**: one file per language.
- Send **WebVTT** (`.vtt`) or **SRT** (`.srt`). SRT is converted to WebVTT when it is stored.
  Anything else is refused. Files are limited to 1 MiB.
- The player loads them through `GET /api/v1/lessons/:id/captions/:locale.vtt`, which checks the
  course access.
- Captions can still be pasted as an `https` link through `PATCH /lessons/:id`.

## Cleanup

Deleting a lesson or a module also deletes its attachments and captions from the storage.

## Configuration

| Variable               | Default    | Meaning                                       |
| ---------------------- | ---------- | --------------------------------------------- |
| `ATTACHMENT_MAX_BYTES` | `52428800` | Largest attachment an instructor may upload.  |

The browser needs the same storage CORS rule described in [video.md](video.md): attachments are
uploaded with `PUT` straight to `S3_PUBLIC_URL`.
