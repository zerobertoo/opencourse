import type { VideoService } from '../video';
import type { MockContext } from './context';

/** The demo has one sample clip, which every uploaded video plays. */
export const SAMPLE_VIDEO_URL = '/media/sample-lesson.mp4';

export function createMockVideoService(context: MockContext): VideoService {
  return {
    getPlaybackUrl: () => context.run('video.getPlaybackUrl', () => SAMPLE_VIDEO_URL),
  };
}
