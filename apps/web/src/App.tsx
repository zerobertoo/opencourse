import { lazy } from 'react';
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

// route areas load on demand (layouts show a skeleton meanwhile) so sign-in does not ship the player, studio and admin
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminGrants = lazy(() => import('@/pages/admin/Grants').then((m) => ({ default: m.AdminGrants })));
const AdminPlugins = lazy(() => import('@/pages/admin/Plugins').then((m) => ({ default: m.AdminPlugins })));
const AdminSettings = lazy(() => import('@/pages/admin/Settings').then((m) => ({ default: m.AdminSettings })));
const AdminUsers = lazy(() => import('@/pages/admin/Users').then((m) => ({ default: m.AdminUsers })));
const AdminVideos = lazy(() => import('@/pages/admin/Videos').then((m) => ({ default: m.AdminVideos })));
const AdminApiKeys = lazy(() => import('@/pages/admin/ApiKeys').then((m) => ({ default: m.AdminApiKeys })));
const AdminWebhooks = lazy(() => import('@/pages/admin/Webhooks').then((m) => ({ default: m.AdminWebhooks })));
const Showcase = lazy(() => import('@/pages/Showcase').then((m) => ({ default: m.Showcase })));
const CourseEditor = lazy(() => import('@/pages/studio/CourseEditor').then((m) => ({ default: m.CourseEditor })));
const StudioCourses = lazy(() => import('@/pages/studio/Courses').then((m) => ({ default: m.StudioCourses })));
const StudioDashboard = lazy(() => import('@/pages/studio/Dashboard').then((m) => ({ default: m.StudioDashboard })));
const Certificates = lazy(() => import('@/pages/student/Certificates').then((m) => ({ default: m.Certificates })));
const CoursePage = lazy(() => import('@/pages/student/CoursePage').then((m) => ({ default: m.CoursePage })));
const Home = lazy(() => import('@/pages/student/Home').then((m) => ({ default: m.Home })));
const LessonPlayer = lazy(() => import('@/pages/student/LessonPlayer').then((m) => ({ default: m.LessonPlayer })));
const Settings = lazy(() => import('@/pages/student/Settings').then((m) => ({ default: m.Settings })));

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
