/** Addresses of the routes that take parameters, so a path is written in one place. */
export const routes = {
  course: (slug: string) => `/courses/${encodeURIComponent(slug)}`,
  lesson: (slug: string, lessonId: string) =>
    `${routes.course(slug)}/lessons/${encodeURIComponent(lessonId)}`,
  /** The Studio editor of a course, on one of its tabs when given. */
  studioCourse: (courseId: string, tab?: string) =>
    `/studio/courses/${encodeURIComponent(courseId)}${tab ? `/${encodeURIComponent(tab)}` : ''}`,
};
