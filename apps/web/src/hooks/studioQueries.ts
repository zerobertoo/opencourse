import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUPPORTED_LOCALES, type CourseDetail, type Locale } from '@opencourse/shared';
import { useMemo } from 'react';
import type {
  AttachmentUpload,
  CourseFilters,
  CreateCourseInput,
  CreateGrantInput,
  CreateInviteInput,
  CreateLessonInput,
  CreateModuleInput,
  CurriculumLayoutItem,
  LessonVideoSource,
  UpdateCourseInput,
  UpdateLessonInput,
  UpdateModuleInput,
} from '@/services';
import { useServices } from '@/services/ServicesContext';

/** Cache keys of the Studio. Everything here is dropped when the signed-in user changes. */
export const studioKeys = {
  dashboard: ['studio', 'dashboard'] as const,
  courses: (filters: CourseFilters) => ['studio', 'courses', filters] as const,
  course: (courseId: string) => ['courses', 'id', courseId] as const,
  students: (courseId: string) => ['studio', 'students', courseId] as const,
  invites: (courseId: string) => ['studio', 'invites', courseId] as const,
  assignable: ['studio', 'assignable-students'] as const,
  settings: ['settings'] as const,
};

/** How often the editor re-reads a course while one of its videos is still being prepared. */
const VIDEO_POLL_INTERVAL_MS = 1000;

function hasVideoInProgress(course: CourseDetail | undefined): boolean {
  return (
    course?.modules.some((courseModule) =>
      courseModule.lessons.some(
        (lesson) =>
          lesson.type === 'video' &&
          (lesson.video?.status === 'processing' || lesson.video?.status === 'uploading'),
      ),
    ) ?? false
  );
}

export function useStudioDashboard() {
  const { studio } = useServices();
  return useQuery({ queryKey: studioKeys.dashboard, queryFn: () => studio.getDashboard() });
}

export function useStudioCourses(filters: CourseFilters) {
  const { courses } = useServices();
  return useQuery({
    queryKey: studioKeys.courses(filters),
    queryFn: () => courses.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCourseById(courseId: string) {
  const { courses } = useServices();
  return useQuery({
    queryKey: studioKeys.course(courseId),
    queryFn: () => courses.getById(courseId),
    refetchInterval: (query) =>
      hasVideoInProgress(query.state.data) ? VIDEO_POLL_INTERVAL_MS : false,
  });
}

/** Languages the instance has enabled, always including the course default language. */
export function useEnabledLocales(course?: CourseDetail): Locale[] {
  const { settings } = useServices();
  const query = useQuery({ queryKey: studioKeys.settings, queryFn: () => settings.get() });
  const enabled = query.data?.enabledLocales ?? SUPPORTED_LOCALES;
  const defaultLocale = course?.defaultLocale;
  return useMemo(
    () =>
      defaultLocale && !enabled.includes(defaultLocale)
        ? [defaultLocale, ...enabled]
        : [...enabled],
    [enabled, defaultLocale],
  );
}

export function useCourseStudents(courseId: string) {
  const { enrollments } = useServices();
  return useQuery({
    queryKey: studioKeys.students(courseId),
    queryFn: () => enrollments.listCourseStudents(courseId),
  });
}

export function useCourseInvites(courseId: string) {
  const { grants } = useServices();
  return useQuery({
    queryKey: studioKeys.invites(courseId),
    queryFn: () => grants.listInvites({ courseId }),
  });
}

export function useAssignableStudents(enabled: boolean) {
  const { users } = useServices();
  return useQuery({
    queryKey: studioKeys.assignable,
    queryFn: () => users.list({ role: 'student', active: true }),
    enabled,
  });
}

export function useCreateCourse() {
  const { courses } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) => courses.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['studio'] }),
  });
}

/** Puts a freshly saved course in the cache and refreshes everything that derives from it. */
function useCourseSync(courseId: string) {
  const queryClient = useQueryClient();
  return (course: CourseDetail) => {
    queryClient.setQueryData(studioKeys.course(courseId), course);
    void queryClient.invalidateQueries({ queryKey: ['studio'] });
    void queryClient.invalidateQueries({ queryKey: ['courses', 'slug'] });
    void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
  };
}

export function useUpdateCourse(courseId: string) {
  const { courses } = useServices();
  const sync = useCourseSync(courseId);
  return useMutation({
    mutationFn: (input: UpdateCourseInput) => courses.update(courseId, input),
    onSuccess: sync,
  });
}

/** Every curriculum operation of the editor; each one refreshes the cached course. */
export function useCurriculumMutations(courseId: string) {
  const { curriculum } = useServices();
  const sync = useCourseSync(courseId);

  return {
    createModule: useMutation({
      mutationFn: (input: Omit<CreateModuleInput, 'courseId'>) =>
        curriculum.createModule({ ...input, courseId }),
      onSuccess: (result) => sync(result.course),
    }),
    updateModule: useMutation({
      mutationFn: ({ moduleId, input }: { moduleId: string; input: UpdateModuleInput }) =>
        curriculum.updateModule(moduleId, input),
      onSuccess: sync,
    }),
    deleteModule: useMutation({
      mutationFn: (moduleId: string) => curriculum.deleteModule(moduleId),
      onSuccess: sync,
    }),
    createLesson: useMutation({
      mutationFn: (input: CreateLessonInput) => curriculum.createLesson(input),
      onSuccess: (result) => sync(result.course),
    }),
    updateLesson: useMutation({
      mutationFn: ({ lessonId, input }: { lessonId: string; input: UpdateLessonInput }) =>
        curriculum.updateLesson(lessonId, input),
      onSuccess: sync,
    }),
    deleteLesson: useMutation({
      mutationFn: (lessonId: string) => curriculum.deleteLesson(lessonId),
      onSuccess: sync,
    }),
    addAttachments: useMutation({
      mutationFn: ({ lessonId, files }: { lessonId: string; files: AttachmentUpload[] }) =>
        curriculum.addLessonAttachments(lessonId, files),
      onSuccess: sync,
    }),
    removeAttachment: useMutation({
      mutationFn: ({ lessonId, attachmentId }: { lessonId: string; attachmentId: string }) =>
        curriculum.removeLessonAttachment(lessonId, attachmentId),
      onSuccess: sync,
    }),
    setVideo: useMutation({
      mutationFn: ({
        lessonId,
        source,
        onProgress,
      }: {
        lessonId: string;
        source: LessonVideoSource;
        /** Share of an upload already sent, from 0 to 1. */
        onProgress?: (fraction: number) => void;
      }) => curriculum.setLessonVideo(lessonId, source, { onProgress }),
      onSuccess: sync,
    }),
    removeVideo: useMutation({
      mutationFn: (lessonId: string) => curriculum.removeLessonVideo(lessonId),
      onSuccess: sync,
    }),
    reorder: useMutation({
      mutationFn: (layout: CurriculumLayoutItem[]) => curriculum.reorder(courseId, layout),
      onSuccess: sync,
    }),
  };
}

export function useGrantMutations(courseId: string) {
  const { grants } = useServices();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: studioKeys.students(courseId) }),
      queryClient.invalidateQueries({ queryKey: studioKeys.invites(courseId) }),
      queryClient.invalidateQueries({ queryKey: studioKeys.dashboard }),
      queryClient.invalidateQueries({ queryKey: ['enrollments'] }),
    ]);

  return {
    createGrant: useMutation({
      mutationFn: (input: CreateGrantInput) => grants.create(input),
      onSuccess: refresh,
    }),
    revokeGrant: useMutation({
      mutationFn: (grantId: string) => grants.revoke(grantId),
      onSuccess: refresh,
    }),
    createInvite: useMutation({
      mutationFn: (input: CreateInviteInput) => grants.createInvite(input),
      onSuccess: refresh,
    }),
  };
}
