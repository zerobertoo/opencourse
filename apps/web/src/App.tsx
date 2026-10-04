import { Route, Routes } from 'react-router-dom';
import { StaffLayout } from '@/components/layout/StaffLayout';
import { StudentLayout } from '@/components/layout/StudentLayout';
import { Toaster } from '@/components/ui/toaster';
import { NotFound } from '@/pages/NotFound';
import { Showcase } from '@/pages/Showcase';
import { UnderConstruction } from '@/pages/UnderConstruction';

export function App() {
  return (
    <>
      <Routes>
        <Route element={<StudentLayout />}>
          <Route index element={<Showcase />} />
        </Route>
        <Route element={<StaffLayout />}>
          <Route path="studio" element={<UnderConstruction titleKey="studio:dashboard.title" />} />
          <Route path="admin" element={<UnderConstruction titleKey="admin:dashboard.title" />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </>
  );
}
