import type { FailedVideo, LocalVideoAsset } from '@opencourse/shared';

/** What the player needs to start an uploaded video. */
export interface VideoPlayback {
  /** Address of the HLS master playlist. */
  url: string;
  /** Address of the poster frame, null for a video encoded without one. */
  posterUrl: string | null;
}

/** Playback of videos uploaded to this instance. */
export interface VideoService {
  /**
   * Playlist and poster addresses of a ready video. The playlist carries a token that expires, so
   * ask again each time a lesson opens instead of keeping it.
   */
  getPlayback(assetId: string): Promise<VideoPlayback>;
  /**
   * Address a `<track>` can load a caption from. A caption uploaded to this instance is behind the
   * access check, so it is fetched with the session and handed over as a local object address.
   */
  getCaptionUrl(url: string): Promise<string>;
  /**
   * Address that saves an attachment. The API issues it behind the access check, so the request
   * carries the session (and renews it when it expired) instead of being a plain link.
   */
  getDownloadUrl(path: string): Promise<string>;
  /** Uploaded videos that failed to encode, newest first. Admin only. */
  listFailed(): Promise<FailedVideo[]>;
  /** Sends a failed video back to the encoder. Admin only. */
  retry(assetId: string): Promise<LocalVideoAsset>;
}
