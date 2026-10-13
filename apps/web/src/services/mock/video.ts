import type { VideoService } from '../video';
import type { MockContext } from './context';

/** The demo has one sample clip, which every uploaded video plays. */
export const SAMPLE_VIDEO_URL = `${import.meta.env.BASE_URL}media/sample-lesson.mp4`;

export function createMockVideoService(context: MockContext): VideoService {
  return {
    getPlayback: () =>
      context.run('video.getPlayback', () => ({ url: SAMPLE_VIDEO_URL, posterUrl: null })),
    // the mock keeps captions and files as data URLs, which load as they are
    getCaptionUrl: (url) => Promise.resolve(url),
    getDownloadUrl: (path) => Promise.resolve(path),
  };
}
