import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Caption, Progress } from '@opencourse/shared';
import { useServices } from '@/services/ServicesContext';

/** Cache keys. Switching users discards everything that is not `auth`. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  myCourses: ['enrollments', 'mine'] as const,
  continueLearning: ['enrollments', 'continue'] as const,
  course: (slug: string) => ['courses', 'slug', slug] as const,
  courseAccess: (courseId: string) => ['courses', courseId, 'access'] as const,
  courseProgress: (courseId: string) => ['progress', courseId] as const,
  user: (userId: string) => ['users', userId] as const,
  certificates: ['certificates', 'mine'] as const,
  quizAttempts: (lessonId: string) => ['quiz-attempts', lessonId] as const,
  lessonNote: (lessonId: string) => ['notes', lessonId] as const,
  invite: (token: string) => ['auth', 'invite', token] as const,
  sessions: ['sessions', 'mine'] as const,
};

export function useMyCourses() {
  const { enrollments } = useServices();
  return useQuery({
    queryKey: queryKeys.myCourses,
    queryFn: () => enrollments.listMyCourses(),
  });
}

export function useContinueLearning() {
  const { enrollments } = useServices();
  return useQuery({
    queryKey: queryKeys.continueLearning,
    queryFn: () => enrollments.getContinueLearning(),
  });
}

export function useCourseBySlug(slug: string) {
  const { courses } = useServices();
  return useQuery({
    queryKey: queryKeys.course(slug),
    queryFn: () => courses.getBySlug(slug),
  });
}

export function useCourseAccess(courseId: string | undefined) {
  const { enrollments } = useServices();
  return useQuery({
    queryKey: queryKeys.courseAccess(courseId ?? ''),
    queryFn: () => enrollments.canAccess(courseId!),
    enabled: courseId !== undefined,
  });
}

/** The playback token and the poster address last 6 hours; both are renewed well before that. */
const PLAYBACK_URL_STALE_MS = 5 * 60 * 60 * 1000;

/**
 * Streaming and poster addresses of an uploaded video. The first holds a token, so it is asked for when the lesson
 * opens and kept as it is while the student watches: a new address in the middle of playback
 * would restart the player. A tab left open past the token's life gets a fresh one on return.
 */
export function useVideoPlayback(assetId: string | undefined) {
  const { video } = useServices();
  return useQuery({
    queryKey: ['video', 'playback', assetId ?? ''],
    queryFn: () => video.getPlayback(assetId!),
    enabled: assetId !== undefined,
    staleTime: PLAYBACK_URL_STALE_MS,
    refetchOnReconnect: false,
    gcTime: 0,
  });
}

/**
 * The captions with an address a `<track>` can load, in the order given. A caption still being
 * fetched is left out until it is ready. Kept only while the player is mounted, so a replaced
 * file is read again the next time the lesson opens.
 */
export function useCaptionTracks(captions: Caption[]): Caption[] {
  const { video } = useServices();
  const tracks = useQueries({
    queries: captions.map((caption) => ({
      queryKey: ['video', 'caption', caption.url],
      queryFn: () => video.getCaptionUrl(caption.url),
      staleTime: Infinity,
      gcTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
    combine: (results) =>
      results.flatMap((result, index) =>
        result.data === undefined ? [] : [{ ...captions[index]!, url: result.data }],
      ),
  });

  // object addresses pin their file in memory until revoked
  const addressKey = tracks.map((track) => track.url).join('\n');
  useEffect(() => {
    const addresses = addressKey === '' ? [] : addressKey.split('\n');
    return () => {
      for (const address of addresses) {
        if (address.startsWith('blob:')) URL.revokeObjectURL(address);
      }
    };
  }, [addressKey]);

  return tracks;
}

export function useCourseProgress(courseId: string | undefined, enabled = true) {
  const { progress } = useServices();
  return useQuery({
    queryKey: queryKeys.courseProgress(courseId ?? ''),
    queryFn: () => progress.getCourseProgress(courseId!),
    enabled: courseId !== undefined && enabled,
  });
}

export function useUserById(userId: string | undefined) {
  const { users } = useServices();
  return useQuery({
    queryKey: queryKeys.user(userId ?? ''),
    queryFn: () => users.getById(userId!),
    enabled: userId !== undefined,
  });
}

export function useMyCertificates() {
  const { certificates } = useServices();
  return useQuery({
    queryKey: queryKeys.certificates,
    queryFn: () => certificates.listMine(),
  });
}

export function useQuizAttempts(lessonId: string, enabled: boolean) {
  const { progress } = useServices();
  return useQuery({
    queryKey: queryKeys.quizAttempts(lessonId),
    queryFn: () => progress.listQuizAttempts(lessonId),
    enabled,
  });
}

export function useLessonNote(lessonId: string) {
  const { notes } = useServices();
  return useQuery({
    queryKey: queryKeys.lessonNote(lessonId),
    queryFn: () => notes.getLessonNote(lessonId),
  });
}

/** Invalidates everything that depends on the student's progress in a course. */
function useInvalidateLearning(courseId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.courseProgress(courseId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.myCourses }),
      queryClient.invalidateQueries({ queryKey: queryKeys.continueLearning }),
      queryClient.invalidateQueries({ queryKey: queryKeys.certificates }),
    ]);
}

export function useSetLessonCompleted(courseId: string) {
  const { progress } = useServices();
  const invalidate = useInvalidateLearning(courseId);
  return useMutation({
    mutationFn: ({ lessonId, completed }: { lessonId: string; completed: boolean }) =>
      progress.setLessonCompleted(lessonId, completed),
    onSuccess: invalidate,
  });
}

/** Saves the video position and mirrors it in the cached progress so resuming stays accurate. */
export function useSaveVideoPosition(courseId: string) {
  const { progress } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, positionSeconds }: { lessonId: string; positionSeconds: number }) =>
      progress.saveVideoPosition(lessonId, positionSeconds),
    onSuccess: (saved) =>
      queryClient.setQueryData<Progress[]>(queryKeys.courseProgress(courseId), (entries = []) => [
        ...entries.filter((entry) => entry.lessonId !== saved.lessonId),
        saved,
      ]),
  });
}

export function useSubmitQuiz(courseId: string, lessonId: string) {
  const { progress } = useServices();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateLearning(courseId);
  return useMutation({
    mutationFn: (answers: Record<string, string>) => progress.submitQuizAttempt(lessonId, answers),
    onSuccess: async () => {
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: queryKeys.quizAttempts(lessonId) }),
      ]);
    },
  });
}

export function useSaveLessonNote(lessonId: string) {
  const { notes } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => notes.saveLessonNote(lessonId, content),
    onSuccess: (note) => queryClient.setQueryData(queryKeys.lessonNote(lessonId), note),
  });
}

/** Public certificate verification by code; resolves to null for an unknown code. */
export function useVerifyCertificate(code: string) {
  const { certificates } = useServices();
  return useQuery({
    queryKey: ['certificates', 'verify', code] as const,
    queryFn: () => certificates.verify(code),
    enabled: code.trim() !== '',
  });
}

/** Devices signed in to the account, most recently used first. */
export function useSessions() {
  const { auth } = useServices();
  return useQuery({ queryKey: queryKeys.sessions, queryFn: () => auth.listSessions() });
}

/** Signs out one of the account's other devices and refreshes the list. */
export function useRevokeSession() {
  const { auth } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => auth.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}
