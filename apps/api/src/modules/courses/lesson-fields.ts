import {
  resolveVideoUrl,
  type ExternalVideoAsset,
  type LessonType,
  quizSchema,
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
 * The quiz stored in `lessons.quiz`. The column is plain jsonb, so a row written by an older
 * shape reads as an empty quiz instead of failing the whole course.
 */
export function readQuiz(stored: unknown): Quiz {
  const parsed = quizSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_QUIZ;
}

/**
 * Column values for a lesson update. A field that does not belong to the lesson type is
 * refused, so a text lesson never carries a quiz or a video. Translations are merged by the caller.
 */
export function toLessonColumns(
  type: LessonType,
  body: UpdateLessonRequest,
  enabledProviders: readonly string[],
): LessonColumns {
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
    columns.video = body.video === null ? null : toExternalVideo(body.video.url, enabledProviders);
  }
  return columns;
}

/**
 * The stored form of a pasted link; a link no provider plugin recognises is refused, and so is
 * one from a provider the admin turned off (lessons already saved with it are not touched).
 */
export function toExternalVideo(
  url: string,
  enabledProviders: readonly string[],
): ExternalVideoAsset {
  const resolved = resolveVideoUrl(url);
  if (!resolved) throw badRequest('Not a link from a supported video provider');
  if (!enabledProviders.includes(resolved.plugin)) {
    throw badRequest('This video provider is turned off in the platform settings');
  }
  return { provider: 'external', status: 'ready', ...resolved };
}
