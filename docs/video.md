# Video

A video lesson holds either **a file uploaded to your instance**, which the worker converts to adaptive HLS, or **a link to an external provider** (YouTube, Vimeo, Bunny Stream, Cloudflare Stream, Panda Video), played through the provider's own player.

## Uploaded files

### How it works

1. In the Studio the instructor picks a file. The web app asks `POST /api/v1/lessons/:id/video/upload` for upload addresses, then sends the file **straight to the S3-compatible storage** in 16 MiB slices (presigned multipart upload). The file never goes through the API.
2. When the last slice is in, the app calls `POST /api/v1/lessons/:id/video/complete`. The API checks that the stored object has the announced size, marks the video `processing` and queues a `transcode-video` job.
3. The worker downloads the original, probes it with `ffprobe` and encodes HLS renditions with `ffmpeg`: **360p, 720p and 1080p, never taller than the original** (an original below 360p gets a single rendition at its own height). Segments are 6 seconds long.
4. When it finishes, the video becomes `ready`, the lesson takes the video duration, the original file is deleted and a `video.processed` event is recorded (webhooks can subscribe to it). If the file cannot be read, the video becomes `error` with a message and is not retried; other failures are retried once.
5. The Studio shows the status (uploading, processing, ready, error) and refreshes by itself while a video is being prepared.

A published course keeps a ready video in every video lesson that had one, so starting an upload that would replace a ready video there is refused (the same rule that stops removing it). To swap such a video, paste a link instead, or move the course back to draft first. A video lesson that has no ready video yet can be uploaded to at any time.

Encoding runs on its own queue with a concurrency of one, so a long video never delays e-mails or webhooks, and two videos never encode at the same time. The API and worker share one image, which includes `ffmpeg`.

### Playback

Students never receive a permanent address. `GET /api/v1/videos/:assetId/playback` (signed in, with access to the course) returns the path of the master playlist with a token that lasts 6 hours. Every playlist request checks the token **and the access again**, so a revoked or expired grant stops new playlists at once. The rendition playlists are rewritten so that each segment is a presigned address on the storage; the video bytes come directly from the storage, not from the API. Segment addresses last at least one hour, or twice the video length when that is longer.

The player is [Video.js 10](https://videojs.org) with hls.js. It offers quality (automatic or fixed), speed, captions, picture-in-picture and fullscreen, and resumes where the student stopped.

### Configuration

| Variable                 | Default                 | Meaning                                                                                       |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| `S3_ENDPOINT`            | `http://localhost:9000` | Storage address as the API and worker reach it (inside Docker: `http://storage:9000`).        |
| `S3_PUBLIC_URL`          | same as `S3_ENDPOINT`   | Storage address as **browsers** reach it. Uploads and video segments go there.                |
| `S3_BUCKET`              | `opencourse`            | Bucket for videos. It must exist (Compose creates it).                                        |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | development values | Credentials. Change them in a real deployment.                                              |
| `S3_REGION`              | `us-east-1`             | Region sent when signing.                                                                     |
| `VIDEO_MAX_UPLOAD_BYTES` | `2147483648` (2 GiB)    | Largest file an instructor may upload.                                                        |

**The storage must be reachable from the browser.** In production put it behind HTTPS on a public address and set `S3_PUBLIC_URL` to it. On start the API asks the storage to allow your web origins (`CORS_ORIGINS`) to `PUT` and `GET`, and to expose the `ETag` header, which the browser needs to finish a multipart upload. If your storage does not support the bucket CORS call, the API logs a warning and you must set the same rule yourself: allowed origins = your web app, methods `GET`, `HEAD`, `PUT`, allowed headers `*`, exposed headers `ETag`. A failing upload with "The video upload failed" almost always means this rule is missing.

Encoding is CPU heavy. Give the worker enough cores and temporary disk for the original file plus its renditions (the worker writes to the system temporary folder and cleans it afterwards). Uploads that were never completed are dropped after 24 hours.

### Honest note on download protection

Self-hosting cannot stop a determined person from saving a video. Anyone who can watch it can also fetch its segments and rebuild the file, and the short-lived addresses only limit sharing links, not copying. If your content needs strong protection (DRM, forensic watermarking, domain locking), use an external provider that sells it and paste its link.

## Links from external providers

Pasting a link in the Studio picks the provider automatically from the address. The platform stores the provider, the video identifier and the embed address, and shows the provider's player in an iframe. The provider does the processing, so the status is always ready. These players report no position, so students mark such lessons complete themselves. A link that no provider recognises is refused, because embedding arbitrary pages would let an instructor put any content in front of students.

| Provider         | Links recognised                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| YouTube          | `youtube.com/watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/` (embedded with the privacy-enhanced domain) |
| Vimeo            | `vimeo.com/ID`, `vimeo.com/ID/HASH` (unlisted), `player.vimeo.com/video/ID?h=HASH`, channel and album links |
| Bunny Stream     | `iframe.mediadelivery.net/embed/` or `/play/` `LIBRARY/VIDEO`                                             |
| Cloudflare Stream | `iframe.videodelivery.net/ID`, `watch.cloudflarestream.com/ID`, `customer-XXXX.cloudflarestream.com/ID`  |
| Panda Video      | `player-vz-XXXX.tv.pandavideo.com.br/embed/?v=VIDEO`                                                      |

Administration, Plugins lists the providers installed on the instance.

### Writing a provider plugin

A provider is a folder in `packages/shared/src/video-providers/` that exports a `VideoProviderPlugin` (see `types.ts`), listed in `registry.ts`. Nothing else changes: the API validates links with the registry, the Studio shows the provider name, the player embeds the address and the Plugins page lists it.

```ts
// packages/shared/src/video-providers/example/index.ts
import { normalizedHost, type VideoProviderPlugin } from '../types';

export const examplePlugin: VideoProviderPlugin = {
  id: 'example', // stored with the lesson: never rename it later
  label: 'Example Video',
  // return the provider's identifier for a link you recognise, otherwise null
  match(url) {
    if (normalizedHost(url) !== 'video.example.com') return null;
    const id = url.pathname.split('/').filter(Boolean)[1];
    return id && /^[a-z0-9]{8,}$/i.test(id) ? { externalId: id } : null;
  },
  // the https address for the player iframe, built only from the identifier
  embedUrl: (externalId) => `https://video.example.com/embed/${externalId}`,
};
```

Rules that keep embeds safe: match the **host exactly** (never with `endsWith` on user input or `includes`), validate the identifier with a strict pattern, and build the embed address only from the identifier on a host you control or the provider owns. Add the plugin to `videoProviders` in `registry.ts` and a few links to `registry.test.ts`, including near-miss addresses that must be refused (`example.com.evil.com`).
