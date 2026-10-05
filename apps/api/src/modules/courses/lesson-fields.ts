import type { LessonType, Quiz, UpdateLessonRequest } from '@opencourse/shared';
import type { LessonRow } from '../../db/schema';
import { badRequest } from '../../errors';

export type LessonColumns = Partial<
  Pick<LessonRow, 'durationSeconds' | 'captions' | 'quiz' | 'video'>
>;

/** What a new quiz lesson starts with. */
export const DEFAULT_QUIZ: Quiz = { passingScore: 70, questions: [] };

/**
 * Column values for a lesson update. A field that does not belong to the lesson type is
 * refused, so a text lesson never carries a quiz or a video. Translations are merged by the caller.
 */
export function toLessonColumns(type: LessonType, body: UpdateLessonRequest): LessonColumns {
  if ((body.video !== undefined || body.captions !== undefined) && type !== 'video') {
    throw badRequest('Only video lessons have a video and captions');
  }
  if (body.quiz !== undefined && type !== 'quiz') {
    throw badRequest('Only quiz lessons have a quiz');
  }

  const columns: LessonColumns = {};
  if (body.durationSeconds !== undefined) columns.durationSeconds = body.durationSeconds;
  if (body.captions !== undefined) columns.captions = body.captions;
  if (body.quiz !== undefined) columns.quiz = body.quiz;
  if (body.video !== undefined) {
    // external links play as they are; uploads arrive with the video adapters (milestone 6)
    columns.video =
      body.video === null
        ? null
        : {
            provider: 'external',
            externalId: body.video.url,
            status: 'ready',
            playbackUrl: body.video.url,
          };
  }
  return columns;
}
