/** Playback of videos uploaded to this instance. */
export interface VideoService {
  /**
   * Address of the HLS master playlist for a ready video. It carries a token that expires, so ask
   * again each time a lesson opens instead of keeping it.
   */
  getPlaybackUrl(assetId: string): Promise<string>;
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
}
