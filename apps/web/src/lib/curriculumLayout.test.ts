import { describe, expect, it } from 'vitest';
import {
  applyDragEnd,
  applyDragOver,
  arrayMove,
  findLessonModuleId,
  layoutsEqual,
  moveLessonToModule,
  moveLessonWithinModule,
  moveModule,
  toLayout,
  type CurriculumLayout,
} from './curriculumLayout';

const layout = (): CurriculumLayout => [
  { moduleId: 'm1', lessonIds: ['a', 'b', 'c'] },
  { moduleId: 'm2', lessonIds: ['d'] },
  { moduleId: 'm3', lessonIds: [] },
];

describe('toLayout', () => {
  it('sorts modules and lessons by their order field', () => {
    const lesson = (id: string, order: number) => ({ id, order });
    const course = {
      modules: [
        { id: 'm2', order: 1, lessons: [lesson('y', 0)] },
        { id: 'm1', order: 0, lessons: [lesson('b', 1), lesson('a', 0)] },
      ],
    } as unknown as Parameters<typeof toLayout>[0];
    expect(toLayout(course)).toEqual([
      { moduleId: 'm1', lessonIds: ['a', 'b'] },
      { moduleId: 'm2', lessonIds: ['y'] },
    ]);
  });
});

describe('arrayMove', () => {
  it('moves forward, backward and ignores invalid origins', () => {
    expect(arrayMove([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(arrayMove([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(arrayMove([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
    expect(arrayMove([1, 2, 3], 0, 99)).toEqual([2, 3, 1]);
  });
});

describe('moving by one position', () => {
  it('moves modules and stops at the edges', () => {
    expect(moveModule(layout(), 'm2', -1).map((m) => m.moduleId)).toEqual(['m2', 'm1', 'm3']);
    expect(moveModule(layout(), 'm2', 1).map((m) => m.moduleId)).toEqual(['m1', 'm3', 'm2']);
    const unchanged = layout();
    expect(moveModule(unchanged, 'm1', -1)).toBe(unchanged);
    expect(moveModule(unchanged, 'm3', 1)).toBe(unchanged);
  });

  it('moves lessons only inside their module', () => {
    expect(moveLessonWithinModule(layout(), 'b', -1)[0]?.lessonIds).toEqual(['b', 'a', 'c']);
    expect(moveLessonWithinModule(layout(), 'b', 1)[0]?.lessonIds).toEqual(['a', 'c', 'b']);
    expect(layoutsEqual(moveLessonWithinModule(layout(), 'a', -1), layout())).toBe(true);
    expect(layoutsEqual(moveLessonWithinModule(layout(), 'd', 1), layout())).toBe(true);
  });
});

describe('moveLessonToModule', () => {
  it('appends the lesson to the target module, including an empty one', () => {
    const moved = moveLessonToModule(layout(), 'a', 'm3');
    expect(moved).toEqual([
      { moduleId: 'm1', lessonIds: ['b', 'c'] },
      { moduleId: 'm2', lessonIds: ['d'] },
      { moduleId: 'm3', lessonIds: ['a'] },
    ]);
    expect(findLessonModuleId(moved, 'a')).toBe('m3');
  });

  it('ignores unknown lessons and modules', () => {
    const original = layout();
    expect(moveLessonToModule(original, 'zzz', 'm1')).toBe(original);
    expect(moveLessonToModule(original, 'a', 'zzz')).toBe(original);
  });
});

describe('drag and drop', () => {
  it('previews a lesson entering another module before the hovered lesson', () => {
    const next = applyDragOver(layout(), 'b', 'd');
    expect(next).toEqual([
      { moduleId: 'm1', lessonIds: ['a', 'c'] },
      { moduleId: 'm2', lessonIds: ['b', 'd'] },
      { moduleId: 'm3', lessonIds: [] },
    ]);
  });

  it('appends to a module when hovering the module itself, even an empty one', () => {
    expect(applyDragOver(layout(), 'a', 'm3')[2]?.lessonIds).toEqual(['a']);
    expect(applyDragOver(layout(), 'a', 'm2')[1]?.lessonIds).toEqual(['d', 'a']);
  });

  it('leaves the layout alone inside the same module and for unknown targets', () => {
    const original = layout();
    expect(applyDragOver(original, 'a', 'c')).toBe(original);
    expect(applyDragOver(original, 'a', 'm1')).toBe(original);
    expect(applyDragOver(original, 'a', 'nope')).toBe(original);
    expect(applyDragOver(original, 'm1', 'm2')).toBe(original);
  });

  it('reorders lessons on drop inside a module', () => {
    expect(applyDragEnd(layout(), 'a', 'c')[0]?.lessonIds).toEqual(['b', 'c', 'a']);
    expect(applyDragEnd(layout(), 'c', 'a')[0]?.lessonIds).toEqual(['c', 'a', 'b']);
  });

  it('reorders modules on drop, and ignores a module dropped on a lesson', () => {
    expect(applyDragEnd(layout(), 'm1', 'm3').map((m) => m.moduleId)).toEqual(['m2', 'm3', 'm1']);
    const original = layout();
    expect(applyDragEnd(original, 'm1', 'a')).toBe(original);
  });

  it('does nothing when dropped outside or on itself', () => {
    const original = layout();
    expect(applyDragEnd(original, 'a', null)).toBe(original);
    expect(applyDragEnd(original, 'a', 'a')).toBe(original);
  });

  it('a cross-module drag followed by a drop keeps every lesson exactly once', () => {
    const afterOver = applyDragOver(layout(), 'a', 'd');
    const final = applyDragEnd(afterOver, 'a', 'd');
    expect(final.flatMap((item) => item.lessonIds).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(final[1]?.lessonIds).toEqual(['d', 'a']);
  });
});
