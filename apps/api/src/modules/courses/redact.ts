import type { CourseDetail } from '@opencourse/shared';

/**
 * Hides which option is correct and why. Grading happens on the server (milestone 5), so people
 * who cannot manage the course never need the answers.
 */
export function redactQuizAnswers(course: CourseDetail): CourseDetail {
  return {
    ...course,
    modules: course.modules.map((courseModule) => ({
      ...courseModule,
      lessons: courseModule.lessons.map((lesson) => {
        if (lesson.type !== 'quiz') return lesson;
        return {
          ...lesson,
          quiz: {
            ...lesson.quiz,
            questions: lesson.quiz.questions.map((question) => ({
              ...question,
              translations: question.translations.map((item) => ({ ...item, explanation: '' })),
              options: question.options.map((option) => ({
                id: option.id,
                translations: option.translations,
              })),
            })),
          },
        };
      }),
    })),
  };
}
