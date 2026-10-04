import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';

describe('mock studio service', () => {
  it('summarizes the instructor courses, students and completion', async () => {
    const { services } = await createServicesSignedInAs('rafael');
    const dashboard = await services.studio.getDashboard();

    // Rafael owns the JavaScript and SQL courses (published) and Time Management (archived)
    expect(dashboard.courses.map((course) => course.courseId).sort()).toEqual([
      'course-javascript',
      'course-sql',
      'course-time',
    ]);
    expect(dashboard.publishedCourses).toBe(2);

    const sql = dashboard.courses.find((course) => course.courseId === 'course-sql');
    // lucas, camila, renata and gustavo have an active SQL grant; only lucas finished it
    expect(sql).toMatchObject({ students: 4, completedStudents: 1, completionRate: 0.25 });

    const totalEnrollments = dashboard.courses.reduce((sum, course) => sum + course.students, 0);
    const totalCompleted = dashboard.courses.reduce((sum, c) => sum + c.completedStudents, 0);
    expect(dashboard.completionRate).toBeCloseTo(totalCompleted / totalEnrollments);
    // a student enrolled in two courses is counted once
    expect(dashboard.activeStudents).toBeLessThan(totalEnrollments);
  });

  it('shows every course to admins and only their own to other instructors', async () => {
    const admin = (await createServicesSignedInAs('marina')).services;
    expect((await admin.studio.getDashboard()).courses).toHaveLength(5);

    const beatriz = (await createServicesSignedInAs('beatriz')).services;
    expect((await beatriz.studio.getDashboard()).courses).toHaveLength(2);
  });

  it('is limited to instructors and admins', async () => {
    await expect(createTestServices().services.studio.getDashboard()).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const student = (await createServicesSignedInAs('lucas')).services;
    await expect(student.studio.getDashboard()).rejects.toMatchObject({ code: 'forbidden' });
  });
});
