/** Playback of videos uploaded to this instance. */
export interface VideoService {
  /**
   * Address of the HLS master playlist for a ready video. It carries a token that expires, so ask
   * again each time a lesson opens instead of keeping it.
   */
  getPlaybackUrl(assetId: string): Promise<string>;
}
