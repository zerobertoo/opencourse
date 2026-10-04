import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireRole } from '@/auth/RequireRole';
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
import { Showcase } from '@/pages/Showcase';
import { Certificates } from '@/pages/student/Certificates';
import { CoursePage } from '@/pages/student/CoursePage';
import { Home } from '@/pages/student/Home';
import { LessonPlayer } from '@/pages/student/LessonPlayer';
import { Settings } from '@/pages/student/Settings';
import { UnderConstruction } from '@/pages/UnderConstruction';

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
              <Route
                path="studio"
                element={<UnderConstruction titleKey="studio:dashboard.title" />}
              />
            </Route>
            <Route element={<RequireRole roles={['admin']} />}>
              <Route
                path="admin"
                element={<UnderConstruction titleKey="admin:dashboard.title" />}
              />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  );
}
