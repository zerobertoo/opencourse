import {
  resolveVideoUrl,
  type ExternalVideoAsset,
  type LessonType,
  type Quiz,
  type UpdateLessonRequest,
} from '@opencourse/shared';
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
    columns.video = body.video === null ? null : toExternalVideo(body.video.url);
  }
  return columns;
}

/** The stored form of a pasted link; a link no provider plugin recognises is refused. */
export function toExternalVideo(url: string): ExternalVideoAsset {
  const resolved = resolveVideoUrl(url);
  if (!resolved) throw badRequest('Not a link from a supported video provider');
  return { provider: 'external', status: 'ready', ...resolved };
}
