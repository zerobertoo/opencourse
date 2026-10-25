import { lazy, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireRole } from '@/auth/RequireRole';
import { BrandStyles } from '@/components/BrandStyles';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { StaffLayout } from '@/components/layout/StaffLayout';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { Toaster } from '@/components/ui/toaster';
import { AcceptInvite } from '@/pages/auth/AcceptInvite';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { Login } from '@/pages/auth/Login';
import { ResetPassword } from '@/pages/auth/ResetPassword';
import { SignUp } from '@/pages/auth/SignUp';
import { NotFound } from '@/pages/NotFound';
import { VerifyCertificate } from '@/pages/VerifyCertificate';

/** Lazy route component from a module with a named export. */
function lazyPage<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

// Route areas load on demand (layouts show a skeleton meanwhile), so sign-in does not
// ship the studio and admin.
const AdminLayout = lazyPage(() => import('@/pages/admin/AdminLayout'), 'AdminLayout');
const AdminGrants = lazyPage(() => import('@/pages/admin/Grants'), 'AdminGrants');
const AdminPlugins = lazyPage(() => import('@/pages/admin/Plugins'), 'AdminPlugins');
const AdminSettings = lazyPage(() => import('@/pages/admin/Settings'), 'AdminSettings');
const AdminUsers = lazyPage(() => import('@/pages/admin/Users'), 'AdminUsers');
const AdminVideos = lazyPage(() => import('@/pages/admin/Videos'), 'AdminVideos');
const AdminApiKeys = lazyPage(() => import('@/pages/admin/ApiKeys'), 'AdminApiKeys');
const AdminWebhooks = lazyPage(() => import('@/pages/admin/Webhooks'), 'AdminWebhooks');
const Showcase = lazyPage(() => import('@/pages/Showcase'), 'Showcase');
const CourseEditor = lazyPage(() => import('@/pages/studio/CourseEditor'), 'CourseEditor');
const StudioCourses = lazyPage(() => import('@/pages/studio/Courses'), 'StudioCourses');
const StudioDashboard = lazyPage(() => import('@/pages/studio/Dashboard'), 'StudioDashboard');
const Certificates = lazyPage(() => import('@/pages/student/Certificates'), 'Certificates');
const CoursePage = lazyPage(() => import('@/pages/student/CoursePage'), 'CoursePage');
const Home = lazyPage(() => import('@/pages/student/Home'), 'Home');
const LessonPlayer = lazyPage(() => import('@/pages/student/LessonPlayer'), 'LessonPlayer');
const Settings = lazyPage(() => import('@/pages/student/Settings'), 'Settings');

export function App() {
  return (
    <>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<SignUp />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="invite/:token" element={<AcceptInvite />} />
          <Route path="verify/:code" element={<VerifyCertificate />} />
        </Route>

        <Route element={<StudentLayout />}>
          <Route path="showcase" element={<Showcase />} />
          <Route element={<RequireAuth />}>
            <Route index element={<Home />} />
            <Route path="courses/:slug" element={<CoursePage />} />
            <Route path="courses/:slug/lessons/:lessonId" element={<LessonPlayer />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<StaffLayout />}>
            <Route element={<RequireRole roles={['instructor', 'admin']} />}>
              <Route path="studio">
                <Route index element={<StudioDashboard />} />
                <Route path="courses" element={<StudioCourses />} />
                <Route path="courses/:courseId/:tab?" element={<CourseEditor />} />
              </Route>
            </Route>
            <Route element={<RequireRole roles={['admin']} />}>
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="users" replace />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="grants" element={<AdminGrants />} />
                <Route path="videos" element={<AdminVideos />} />
                <Route path="webhooks" element={<AdminWebhooks />} />
                <Route path="api-keys" element={<AdminApiKeys />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="plugins" element={<AdminPlugins />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
      <BrandStyles />
    </>
  );
}
