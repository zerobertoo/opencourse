# Video

A video lesson holds either **a file uploaded to your instance**, which the worker converts to adaptive HLS, or **a link to an external provider** (YouTube, Vimeo, Bunny Stream, Cloudflare Stream, Panda Video, Google Drive), played through the provider's own player.

## Uploaded files

### How it works

1. In the Studio the instructor picks a file. The web app asks `POST /api/v1/lessons/:id/video/upload` for upload addresses, then sends the file **straight to the S3-compatible storage** in 16 MiB slices (presigned multipart upload). The file never goes through the API.
2. When the last slice is in, the app calls `POST /api/v1/lessons/:id/video/complete`. The API checks that the stored object has the announced size, marks the video `processing` and queues a `transcode-video` job.
3. The worker downloads the original, probes it with `ffprobe` and encodes HLS renditions with `ffmpeg`: **360p, 720p and 1080p, never taller than the original** (an original below 360p gets a single rendition at its own height). Segments are 6 seconds long. Phone videos stored sideways and flagged as rotated are shown (and sized) turned, as players show them. The worker also stores one **poster frame** (a tenth of the way in, at least one second) next to the renditions; if making it fails the video is still ready, just without a poster.
4. When it finishes, the video becomes `ready`, the lesson takes the video duration, the original file is deleted and a `video.processed` event is recorded (webhooks can subscribe to it). If the file cannot be read, the video becomes `error` with a message and is not retried; other failures are retried once.
5. The Studio shows the status (uploading, processing, ready, error) and refreshes by itself while a video is being prepared.
6. Admins see every video in `error` under **Admin → Videos** (`GET /api/v1/admin/videos/failed`) and can send one back to the encoder with **Try again** (`POST /api/v1/admin/videos/:assetId/retry`). The retry needs the original file, which stays in the storage after a failure; if it is gone, the instructor has to upload the video again.

A published course keeps a ready video in every video lesson that had one, so starting an upload that would replace a ready video there is refused (the same rule that stops removing it). To swap such a video, paste a link instead, or move the course back to draft first. A video lesson that has no ready video yet can be uploaded to at any time.

Encoding runs on its own queue with a concurrency of one, so a long video never delays e-mails or webhooks, and two videos never encode at the same time. The API and worker share one image, which includes `ffmpeg`.

### Playback

Students never receive a permanent address. `GET /api/v1/videos/:assetId/playback` (signed in, with access to the course) returns the path of the master playlist with a token that lasts 6 hours, plus `posterUrl`, a presigned address of the poster frame (or `null` for videos encoded before posters existed). Every playlist request checks the token **and the access again**, so a revoked or expired grant stops new playlists at once. The rendition playlists are rewritten so that each segment is a presigned address on the storage and the encryption key address points at the API; the video bytes come directly from the storage, not from the API. Segment addresses last at least one hour, or twice the video length when that is longer.

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

Two features make uploaded videos harder to leak, without preventing it:

- **Encrypted segments (AES-128).** The worker encrypts every segment and keeps the key in the storage next to them, so the bucket must stay private (never public-read). The player fetches the key from `GET /api/v1/videos/:assetId/key`, which checks the token and the access like the playlists do, so a revoked grant stops receiving the key. This stops simple downloaders that just copy the segments. Videos encoded before this feature stay unencrypted until an admin sends them to the encoder again (**Try again**).
- **Watermark.** The player shows the student's name and e-mail over the video, for about 8 seconds out of every 30, each time in a different place. It discourages sharing recordings and shows who a leaked copy came from. It is off by default; admins turn it on under **Admin → Settings → Video**. It is drawn in the browser, so someone who opens the developer tools can hide it.
- **One video at a time per account.** An account plays one uploaded video at a time, and the newest `play` wins: when a second device starts playing, the first one pauses and says the account is playing elsewhere, with a **Watch here** button to take it back. This is aimed at one account shared by a group, since each person would keep interrupting the others. Nobody is refused at sign-in, and a student who owns two devices only has to press play on the one in front of them. It is on by default and admins can turn it off under **Admin → Settings → Video**. Instructors and admins are not limited, and videos embedded from external providers are not covered. The player reports `play` and a `beat` every 15 seconds to `POST /api/v1/videos/:assetId/heartbeat`; a device that stops beating for 45 seconds frees the stream. The key route refuses a session that does not hold the stream (`409`, `error.details.reason` `stream_in_use`), and when the check itself fails the video plays. It is enforced by the player and the key, so a modified client that never reports can still play what it has already loaded. It stops casual sharing, not a determined one, and it only protects encrypted videos (see above).
- **My devices.** Under **Settings → Signed-in devices** a student sees where the account is signed in (browser, system, last use and address) and can sign out the devices they do not recognise (`GET /api/v1/me/sessions`, `DELETE /api/v1/me/sessions/:id`).

Even so, self-hosting cannot stop a determined person from saving a video. Anyone who can watch it also receives the key and can rebuild the file or record the screen. If your content needs strong protection (DRM, forensic watermarking, domain locking), use an external provider that sells it and paste its link.

### Upgrading from link-only videos

Before provider plugins, a video lesson held any `https` address. Those lessons are converted when read: an address from a supported provider becomes a proper embed, a link to a video file becomes a "Video file" link, and anything else (a page that is not a video, say) shows as no video, which a published course reports as a video that is not ready. The old data is not changed, so paste a supported link in the lesson to fix it.

## Links from external providers

Pasting a link in the Studio picks the provider automatically from the address. The platform stores the provider, the video identifier and the embed address, and shows the provider's player in an iframe. The provider does the processing, so the status is always ready. These players report no position, so students mark such lessons complete themselves. A link that no provider recognises is refused, because embedding arbitrary pages would let an instructor put any content in front of students. The one exception is a direct link to a video file you host yourself (see below), which plays in the platform's own player instead of an iframe.

| Provider         | Links recognised                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| YouTube          | `youtube.com/watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/` (embedded with the privacy-enhanced domain) |
| Vimeo            | `vimeo.com/ID`, `vimeo.com/ID/HASH` (unlisted), `player.vimeo.com/video/ID?h=HASH`, channel and album links |
| Bunny Stream     | `iframe.mediadelivery.net/embed/` or `/play/` `LIBRARY/VIDEO`                                             |
| Cloudflare Stream | `iframe.videodelivery.net/ID`, `watch.cloudflarestream.com/ID`, `customer-XXXX.cloudflarestream.com/ID`  |
| Panda Video      | `player-vz-XXXX.tv.pandavideo.com.br/embed/?v=VIDEO`                                                      |
| Google Drive     | `drive.google.com/file/d/FILE_ID/view` (the file must be shared as "anyone with the link") |
| Video file       | Any `https` link ending in `.mp4`, `.webm`, `.mov`, `.m4v` or `.m3u8` (an HLS playlist), without a user name or password |

Google Drive's player takes no quality setting and often starts in low quality, so students see a hint under it to pick the highest quality in the player settings (gear).

Administration, Plugins lists the providers installed on the instance.

### Writing a provider plugin

A provider is a folder in `packages/shared/src/video-providers/` that exports a `VideoProviderPlugin` (see `types.ts`), listed in `registry.ts`. Nothing else changes: the API validates links with the registry, the Studio shows the provider name, the player embeds the address and the Plugins page lists it.

```ts
// packages/shared/src/video-providers/example/index.ts
import { normalizedHost, type VideoProviderPlugin } from '../types';

export const examplePlugin: VideoProviderPlugin = {
  id: 'example', // stored with the lesson: never rename it later
  label: 'Example Video',
  playback: 'embed',
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

A plugin declares how it plays: `playback: 'embed'` shows the provider's page in an iframe, `playback: 'file'` hands the address to the platform's own player (use it only for addresses that are the video itself).

Rules that keep embeds safe: match the **host exactly** (never with `endsWith` on user input or `includes`), validate the identifier with a strict pattern, and build the embed address only from the identifier on a host you control or the provider owns. Add the plugin to `videoProviders` in `registry.ts` and a few links to `registry.test.ts`, including near-miss addresses that must be refused (`example.com.evil.com`).
