import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CourseDetail, CourseModuleWithLessons, Lesson, Locale } from '@opencourse/shared';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LessonTypeIcon } from '@/components/LessonTypeIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { localizeLesson, localizeModuleTitle, toLocale } from '@/lib/content';
import {
  applyDragEnd,
  applyDragOver,
  isModuleId,
  layoutsEqual,
  toLayout,
  type CurriculumLayout,
} from '@/lib/curriculumLayout';
import { formatClock } from '@/lib/duration';
import { cn } from '@/lib/utils';

interface CurriculumTreeProps {
  course: CourseDetail;
  enabledLocales: Locale[];
  selectedLessonId: string | null;
  onSelectLesson: (lessonId: string) => void;
  /** Persists a new layout after a drop. The tree keeps showing it until this settles. */
  onReorder: (layout: CurriculumLayout) => Promise<void>;
  onAddModule: () => void;
  onAddLesson: (moduleId: string) => void;
  onRenameModule: (moduleId: string) => void;
  onDeleteModule: (moduleId: string) => void;
  onMoveModule: (moduleId: string, direction: -1 | 1) => void;
}

/** True when the lesson has no title in one of the enabled languages. */
function isMissingTranslation(lesson: Lesson, locales: Locale[]): boolean {
  return locales.some(
    (locale) =>
      !lesson.translations.some((item) => item.locale === locale && item.title.trim() !== ''),
  );
}

function DragHandle({
  label,
  setActivatorNodeRef,
  attributes,
  listeners,
}: {
  label: string;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: React.HTMLAttributes<HTMLElement> | undefined;
}) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
}

interface LessonRowProps {
  lesson: Lesson;
  title: string;
  isSelected: boolean;
  isMissingTranslation: boolean;
  onSelect: () => void;
}

function LessonRow({ lesson, title, isSelected, isMissingTranslation, onSelect }: LessonRowProps) {
  const { t } = useTranslation(['studio', 'common']);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, data: { type: 'lesson' } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1 rounded-lg border bg-surface ps-1 pe-2',
        isSelected && 'border-primary bg-accent',
        isDragging && 'opacity-40',
      )}
    >
      <DragHandle
        label={t('studio:dnd.handle', { title })}
        setActivatorNodeRef={setActivatorNodeRef}
        attributes={attributes}
        listeners={listeners}
      />
      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? 'true' : undefined}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-start text-sm"
      >
        <LessonTypeIcon type={lesson.type} className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">{t(`common:lessonTypes.${lesson.type}`)}:</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {isMissingTranslation ? (
          <>
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="sr-only">{t('studio:translation.incompleteMarker')}</span>
          </>
        ) : null}
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatClock(lesson.durationSeconds)}
        </span>
      </button>
    </li>
  );
}

interface ModuleCardProps extends Omit<
  CurriculumTreeProps,
  'course' | 'onReorder' | 'onAddModule'
> {
  courseModule: CourseModuleWithLessons;
  lessonIds: string[];
  title: string;
  lessonsById: Map<string, Lesson>;
  titleOf: (lesson: Lesson) => string;
  isFirst: boolean;
  isLast: boolean;
}

function ModuleCard({
  courseModule,
  lessonIds,
  title,
  lessonsById,
  titleOf,
  isFirst,
  isLast,
  enabledLocales,
  selectedLessonId,
  onSelectLesson,
  onAddLesson,
  onRenameModule,
  onDeleteModule,
  onMoveModule,
}: ModuleCardProps) {
  const { t } = useTranslation(['studio', 'common']);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: courseModule.id, data: { type: 'module' } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <Card className="p-2 sm:p-3">
        <div className="flex items-center gap-1">
          <DragHandle
            label={t('studio:dnd.handle', { title })}
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
          />
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h3>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {t('studio:content.lessonCount', { count: lessonIds.length })}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('studio:content.moduleActions', { title })}
              >
                <MoreVertical aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onRenameModule(courseModule.id)}>
                <Pencil aria-hidden="true" />
                {t('studio:content.renameModule')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isFirst}
                onSelect={() => onMoveModule(courseModule.id, -1)}
              >
                <ArrowUp aria-hidden="true" />
                {t('studio:content.moveUp')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isLast} onSelect={() => onMoveModule(courseModule.id, 1)}>
                <ArrowDown aria-hidden="true" />
                {t('studio:content.moveDown')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive [&_svg]:text-destructive"
                onSelect={() => onDeleteModule(courseModule.id)}
              >
                <Trash2 aria-hidden="true" />
                {t('studio:content.deleteModule')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <SortableContext items={lessonIds} strategy={verticalListSortingStrategy}>
          <ul
            className="mt-2 min-h-2 space-y-1.5"
            aria-label={t('studio:content.lessonsOf', { title })}
          >
            {lessonIds.map((lessonId) => {
              const lesson = lessonsById.get(lessonId);
              if (!lesson) return null;
              return (
                <LessonRow
                  key={lessonId}
                  lesson={lesson}
                  title={titleOf(lesson)}
                  isSelected={lessonId === selectedLessonId}
                  isMissingTranslation={isMissingTranslation(lesson, enabledLocales)}
                  onSelect={() => onSelectLesson(lessonId)}
                />
              );
            })}
          </ul>
        </SortableContext>
        {lessonIds.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t('studio:content.emptyModule')}
          </p>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          aria-label={t('studio:content.addLessonTo', { title })}
          onClick={() => onAddLesson(courseModule.id)}
        >
          <Plus aria-hidden="true" />
          {t('studio:content.addLesson')}
        </Button>
      </Card>
    </li>
  );
}

/**
 * Sortable curriculum: modules reorder among themselves and lessons reorder inside a module or
 * move to another one. Every drag also works with the keyboard, and each module menu offers
 * explicit "move" actions as a non-drag alternative.
 */
export function CurriculumTree({
  course,
  enabledLocales,
  selectedLessonId,
  onSelectLesson,
  onReorder,
  onAddModule,
  onAddLesson,
  onRenameModule,
  onDeleteModule,
  onMoveModule,
}: CurriculumTreeProps) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const uiLocale = toLocale(i18n.resolvedLanguage);
  const savedLayout = useMemo(() => toLayout(course), [course]);
  /** Layout while dragging (and while the new order is being saved). */
  const [draft, setDraft] = useState<CurriculumLayout | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const layout = draft ?? savedLayout;

  const modulesById = useMemo(
    () => new Map(course.modules.map((item) => [item.id, item])),
    [course.modules],
  );
  const lessonsById = useMemo(
    () => new Map(course.modules.flatMap((item) => item.lessons).map((l) => [l.id, l])),
    [course.modules],
  );
  const moduleIds = useMemo(() => new Set(modulesById.keys()), [modulesById]);

  const titleOfLesson = (lesson: Lesson) =>
    localizeLesson(lesson, uiLocale, course.defaultLocale).title || t('studio:content.untitled');
  const titleOfModule = (courseModule: CourseModuleWithLessons) =>
    localizeModuleTitle(courseModule, uiLocale, course.defaultLocale) ||
    t('studio:content.untitled');
  const titleOfId = (id: string | number) => {
    const key = String(id);
    const courseModule = modulesById.get(key);
    if (courseModule) return titleOfModule(courseModule);
    const lesson = lessonsById.get(key);
    return lesson ? titleOfLesson(lesson) : key;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // modules only collide with modules; lessons prefer other lessons and fall back to a module
  const collisionDetection: CollisionDetection = (args) => {
    if (moduleIds.has(String(args.active.id))) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => moduleIds.has(String(c.id))),
      });
    }
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
    const lessonHits = hits.filter((hit) => !moduleIds.has(String(hit.id)));
    if (lessonHits.length > 0) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) =>
          lessonHits.some((hit) => hit.id === c.id),
        ),
      });
    }
    return hits.filter((hit) => moduleIds.has(String(hit.id))).slice(0, 1);
  };

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || moduleIds.has(String(active.id))) return;
    const current = draft ?? savedLayout;
    const next = applyDragOver(current, String(active.id), String(over.id));
    if (next !== current) setDraft(next);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const final = applyDragEnd(
      draft ?? savedLayout,
      String(active.id),
      over ? String(over.id) : null,
    );
    if (layoutsEqual(final, savedLayout)) {
      setDraft(null);
      return;
    }
    setDraft(final);
    void onReorder(final).finally(() => setDraft(null));
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDraft(null);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('studio:dnd.pickedUp', { title: titleOfId(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('studio:dnd.movedOver', { title: titleOfId(active.id), target: titleOfId(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('studio:dnd.dropped', { title: titleOfId(active.id), target: titleOfId(over.id) })
        : t('studio:dnd.droppedOutside', { title: titleOfId(active.id) }),
    onDragCancel: ({ active }) => t('studio:dnd.cancelled', { title: titleOfId(active.id) }),
  };

  return (
    <section aria-labelledby="curriculum-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="curriculum-heading" className="text-xl font-semibold">
          {t('studio:content.curriculum')}
        </h2>
        <Button variant="outline" size="sm" onClick={onAddModule}>
          <Plus aria-hidden="true" />
          {t('studio:content.addModule')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('studio:content.dragHint')}</p>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('studio:dnd.instructions') },
        }}
      >
        <SortableContext
          items={layout.map((item) => item.moduleId)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="space-y-3" aria-label={t('studio:content.modulesLabel')}>
            {layout.map((item, index) => {
              const courseModule = modulesById.get(item.moduleId);
              if (!courseModule) return null;
              return (
                <ModuleCard
                  key={item.moduleId}
                  courseModule={courseModule}
                  lessonIds={item.lessonIds}
                  title={titleOfModule(courseModule)}
                  lessonsById={lessonsById}
                  titleOf={titleOfLesson}
                  isFirst={index === 0}
                  isLast={index === layout.length - 1}
                  enabledLocales={enabledLocales}
                  selectedLessonId={selectedLessonId}
                  onSelectLesson={onSelectLesson}
                  onAddLesson={onAddLesson}
                  onRenameModule={onRenameModule}
                  onDeleteModule={onDeleteModule}
                  onMoveModule={onMoveModule}
                />
              );
            })}
          </ol>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary bg-surface px-3 py-2 text-sm shadow-lg">
              {isModuleId(layout, activeId) ? null : (
                <LessonTypeIcon
                  type={lessonsById.get(activeId)?.type ?? 'text'}
                  className="size-4 text-muted-foreground"
                />
              )}
              <span className="truncate">{titleOfId(activeId)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
