import { matchPath } from 'react-router-dom';

/** Route patterns and the `common:pageTitle.*` key naming each page, in the order they are tried. */
const PAGE_TITLE_ROUTES = [
  { path: '/login', key: 'login' },
  { path: '/signup', key: 'signUp' },
  { path: '/forgot-password', key: 'forgotPassword' },
  { path: '/reset-password', key: 'resetPassword' },
  { path: '/invite/:token', key: 'invite' },
  { path: '/verify/:code', key: 'verifyCertificate' },
  { path: '/showcase', key: 'showcase' },
  { path: '/', key: 'home' },
  { path: '/courses/:slug', key: 'course' },
  { path: '/courses/:slug/lessons/:lessonId', key: 'lesson' },
  { path: '/certificates', key: 'certificates' },
  { path: '/settings', key: 'settings' },
  { path: '/studio', key: 'studioDashboard' },
  { path: '/studio/courses', key: 'studioCourses' },
  { path: '/studio/courses/:courseId/:tab?', key: 'courseEditor' },
  { path: '/admin/users', key: 'adminUsers' },
  { path: '/admin/grants', key: 'adminGrants' },
  { path: '/admin/videos', key: 'adminVideos' },
  { path: '/admin/webhooks', key: 'adminWebhooks' },
  { path: '/admin/api-keys', key: 'adminApiKeys' },
  { path: '/admin/settings', key: 'adminSettings' },
  { path: '/admin/plugins', key: 'adminPlugins' },
] as const;

export type PageTitleKey = (typeof PAGE_TITLE_ROUTES)[number]['key'] | 'notFound';

/** The title key of the page at `pathname`, or `notFound` when no route matches. */
export function pageTitleKey(pathname: string): PageTitleKey {
  const route = PAGE_TITLE_ROUTES.find(({ path }) => matchPath({ path, end: true }, pathname));
  return route?.key ?? 'notFound';
}
