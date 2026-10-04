import type { CourseDetail } from '@opencourse/shared';
import type { CurriculumLayoutItem } from '@/services';

/** Module/lesson ids in display order: the shape drag and drop works on. */
export type CurriculumLayout = CurriculumLayoutItem[];

/** Layout of a course, with modules and lessons sorted by `order`. */
export function toLayout(course: CourseDetail): CurriculumLayout {
  return [...course.modules]
    .sort((a, b) => a.order - b.order)
    .map((courseModule) => ({
      moduleId: courseModule.id,
      lessonIds: [...courseModule.lessons].sort((a, b) => a.order - b.order).map((l) => l.id),
    }));
}

export function layoutsEqual(a: CurriculumLayout, b: CurriculumLayout): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, index) =>
        item.moduleId === b[index]?.moduleId &&
        item.lessonIds.length === b[index].lessonIds.length &&
        item.lessonIds.every((id, position) => id === b[index]?.lessonIds[position]),
    )
  );
}

export function isModuleId(layout: CurriculumLayout, id: string): boolean {
  return layout.some((item) => item.moduleId === id);
}

/** Module that currently holds the lesson. */
export function findLessonModuleId(layout: CurriculumLayout, lessonId: string): string | null {
  return layout.find((item) => item.lessonIds.includes(lessonId))?.moduleId ?? null;
}

/** Same array with the item at `from` moved to `to` (indexes are clamped). */
export function arrayMove<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= result.length) return result;
  const [moved] = result.splice(from, 1);
  result.splice(Math.min(Math.max(to, 0), result.length), 0, moved as T);
  return result;
}

/** Moves a module one position up (`-1`) or down (`1`); a no-op at the edges. */
export function moveModule(
  layout: CurriculumLayout,
  moduleId: string,
  direction: -1 | 1,
): CurriculumLayout {
  const index = layout.findIndex((item) => item.moduleId === moduleId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.length) return layout;
  return arrayMove(layout, index, target);
}

/** Moves a lesson one position up or down inside its module; a no-op at the edges. */
export function moveLessonWithinModule(
  layout: CurriculumLayout,
  lessonId: string,
  direction: -1 | 1,
): CurriculumLayout {
  return layout.map((item) => {
    const index = item.lessonIds.indexOf(lessonId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= item.lessonIds.length) return item;
    return { ...item, lessonIds: arrayMove(item.lessonIds, index, target) };
  });
}

/** Moves a lesson to the end of another module. */
export function moveLessonToModule(
  layout: CurriculumLayout,
  lessonId: string,
  targetModuleId: string,
): CurriculumLayout {
  if (findLessonModuleId(layout, lessonId) === null || !isModuleId(layout, targetModuleId)) {
    return layout;
  }
  return layout.map((item) => {
    const without = item.lessonIds.filter((id) => id !== lessonId);
    return item.moduleId === targetModuleId
      ? { ...item, lessonIds: [...without, lessonId] }
      : { ...item, lessonIds: without };
  });
}

/**
 * Live preview while a lesson is dragged over another module: the lesson jumps into the module
 * it is hovering, before the hovered lesson (or at the end when hovering the module itself).
 * Hovering inside its own module changes nothing here; `applyDragEnd` reorders on drop.
 */
export function applyDragOver(
  layout: CurriculumLayout,
  activeId: string,
  overId: string,
): CurriculumLayout {
  const sourceModuleId = findLessonModuleId(layout, activeId);
  if (sourceModuleId === null) return layout;

  const targetModuleId = isModuleId(layout, overId) ? overId : findLessonModuleId(layout, overId);
  if (targetModuleId === null || targetModuleId === sourceModuleId) return layout;

  return layout.map((item) => {
    if (item.moduleId === sourceModuleId) {
      return { ...item, lessonIds: item.lessonIds.filter((id) => id !== activeId) };
    }
    if (item.moduleId === targetModuleId) {
      const overIndex = item.lessonIds.indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex : item.lessonIds.length;
      const lessonIds = [...item.lessonIds];
      lessonIds.splice(insertAt, 0, activeId);
      return { ...item, lessonIds };
    }
    return item;
  });
}

/** Final layout after dropping `activeId` on `overId` (a module or a lesson). */
export function applyDragEnd(
  layout: CurriculumLayout,
  activeId: string,
  overId: string | null,
): CurriculumLayout {
  if (overId === null || overId === activeId) return layout;

  if (isModuleId(layout, activeId)) {
    if (!isModuleId(layout, overId)) return layout;
    const from = layout.findIndex((item) => item.moduleId === activeId);
    const to = layout.findIndex((item) => item.moduleId === overId);
    return arrayMove(layout, from, to);
  }

  const moduleId = findLessonModuleId(layout, activeId);
  if (moduleId === null || findLessonModuleId(layout, overId) !== moduleId) return layout;
  return layout.map((item) => {
    if (item.moduleId !== moduleId) return item;
    return {
      ...item,
      lessonIds: arrayMove(
        item.lessonIds,
        item.lessonIds.indexOf(activeId),
        item.lessonIds.indexOf(overId),
      ),
    };
  });
}
