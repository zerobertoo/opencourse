import {
  certificateSchema,
  computeGrantStatus,
  courseDetailSchema,
  flattenLessons,
  getTranslationCoverage,
  grantSchema,
  idSchema,
  inviteSchema,
  platformSettingsSchema,
  progressSchema,
  quizAttemptSchema,
  userSchema,
} from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import { FIXED_NOW } from '@/test/mock-services';
import { createSeedDatabase, DEMO_USER_IDS } from './index';

const db = createSeedDatabase(FIXED_NOW);
const courseBySlug = (slug: string) => {
  const course = db.courses.find((candidate) => candidate.slug === slug);
  if (!course) throw new Error(`Seed course missing: ${slug}`);
  return course;
};

describe('seed data', () => {
  it('validates every entity against the shared zod schemas', () => {
    db.users.forEach((user) => userSchema.parse(user));
    db.courses.forEach((course) => courseDetailSchema.parse(course));
    db.grants.forEach((grant) => grantSchema.parse(grant));
    db.invites.forEach((invite) => inviteSchema.parse(invite));
    db.progress.forEach((entry) => progressSchema.parse(entry));
    db.quizAttempts.forEach((attempt) => quizAttemptSchema.parse(attempt));
    db.certificates.forEach((certificate) => certificateSchema.parse(certificate));
    platformSettingsSchema.parse(db.settings);
  });

  it('uses UUIDs for every entity id', () => {
    const everyId = [...db.users, ...db.courses, ...db.grants, ...db.invites, ...db.certificates]
      .map((entity) => entity.id);
    everyId.forEach((id) => expect(idSchema.safeParse(id).success, id).toBe(true));
  });

  it('keeps references between entities consistent', () => {
    const userIds = new Set(db.users.map((user) => user.id));
    const courseIds = new Set(db.courses.map((course) => course.id));
    const lessonIds = new Set(
      db.courses.flatMap((course) => flattenLessons(course).map((l) => l.id)),
    );

    for (const course of db.courses) expect(userIds, course.id).toContain(course.instructorId);
    for (const grant of db.grants) {
      expect(userIds).toContain(grant.userId);
      expect(userIds).toContain(grant.createdById);
      expect(courseIds).toContain(grant.courseId);
    }
    for (const invite of db.invites) {
      if (invite.courseId) expect(courseIds).toContain(invite.courseId);
    }
    for (const entry of db.progress) {
      expect(userIds).toContain(entry.userId);
      expect(lessonIds).toContain(entry.lessonId);
    }
    for (const attempt of db.quizAttempts) expect(lessonIds).toContain(attempt.lessonId);
    for (const certificate of db.certificates) {
      expect(userIds).toContain(certificate.userId);
      expect(courseIds).toContain(certificate.courseId);
    }
  });

  it('uses unique ids and emails', () => {
    const allLessonIds = db.courses.flatMap((course) => flattenLessons(course).map((l) => l.id));
    expect(new Set(allLessonIds).size).toBe(allLessonIds.length);
    expect(new Set(db.users.map((user) => user.email)).size).toBe(db.users.length);
    expect(new Set(db.invites.map((invite) => invite.token)).size).toBe(db.invites.length);
  });

  it('provides a demo user for each role', () => {
    for (const [role, id] of Object.entries(DEMO_USER_IDS)) {
      expect(db.users.find((user) => user.id === id)?.role).toBe(role);
    }
  });

  it('has several courses, each with multiple modules and varied lesson types', () => {
    expect(db.courses.length).toBeGreaterThanOrEqual(5);
    for (const course of db.courses) {
      expect(course.modules.length, course.slug).toBeGreaterThanOrEqual(2);
      const types = new Set(flattenLessons(course).map((lesson) => lesson.type));
      expect(types.size, course.slug).toBeGreaterThanOrEqual(3);
    }
    const allTypes = new Set(db.courses.flatMap((c) => flattenLessons(c).map((l) => l.type)));
    expect([...allTypes].sort()).toEqual(['file', 'quiz', 'text', 'video']);
  });

  it('covers every course status', () => {
    expect(new Set(db.courses.map((course) => course.status))).toEqual(
      new Set(['draft', 'published', 'archived']),
    );
  });

  it('has exactly one correct option per quiz question', () => {
    for (const course of db.courses) {
      for (const lesson of flattenLessons(course)) {
        if (lesson.type !== 'quiz') continue;
        for (const question of lesson.quiz.questions) {
          expect(
            question.options.filter((o) => o.isCorrect),
            question.id,
          ).toHaveLength(1);
        }
      }
    }
  });

  it('has one course fully translated to English and another only partially', () => {
    expect(getTranslationCoverage(courseBySlug('fundamentos-de-javascript'), 'en').isComplete).toBe(
      true,
    );

    const partial = getTranslationCoverage(courseBySlug('design-de-interfaces-na-pratica'), 'en');
    expect(partial.isComplete).toBe(false);
    expect(partial.translated).toBeGreaterThan(0);

    expect(getTranslationCoverage(courseBySlug('analise-de-dados-com-sql'), 'en').translated).toBe(
      0,
    );
  });

  it('writes the content in Portuguese by default', () => {
    for (const course of db.courses) {
      expect(course.defaultLocale).toBe('pt-BR');
      expect(course.translations.some((translation) => translation.locale === 'pt-BR')).toBe(true);
    }
  });

  it('includes grants in every state and from both sources', () => {
    const statuses = new Set(db.grants.map((grant) => computeGrantStatus(grant, FIXED_NOW)));
    expect(statuses).toEqual(new Set(['active', 'revoked', 'expired']));
    expect(new Set(db.grants.map((grant) => grant.source))).toEqual(new Set(['manual', 'invite']));
    expect(db.grants.some((grant) => grant.expiresAt === null)).toBe(true);
  });

  it('never mentions price, purchase or payment in the content', () => {
    const text = JSON.stringify(db).toLowerCase();
    for (const term of ['preço', 'preco', 'compra', 'pagamento', 'checkout', 'price', 'payment']) {
      expect(text, term).not.toContain(term);
    }
  });
});
