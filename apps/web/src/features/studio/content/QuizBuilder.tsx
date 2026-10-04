import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getQuizIssues,
  type CourseDetail,
  type Lesson,
  type Locale,
  type Quiz,
  type QuizIssue,
  type QuizQuestion,
} from '@opencourse/shared';
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { useCurriculumMutations } from '@/hooks/studioQueries';
import {
  MIN_OPTIONS,
  addOption,
  addQuestion,
  getOptionText,
  getQuestionText,
  moveQuestion,
  removeOption,
  removeQuestion,
  setCorrectOption,
  setOptionText,
  setPassingScore,
  setQuestionText,
} from '@/lib/quizDraft';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { cn } from '@/lib/utils';
import { LocaleTabs } from '../LocaleTabs';
import { PanelSection } from './LessonMedia';

type QuizLesson = Extract<Lesson, { type: 'quiz' }>;

interface QuestionEditorProps {
  question: QuizQuestion;
  index: number;
  total: number;
  locale: Locale;
  defaultLocale: Locale;
  issues: QuizIssue[];
  onChange: (change: (quiz: Quiz) => Quiz) => void;
}

function QuestionEditor({
  question,
  index,
  total,
  locale,
  defaultLocale,
  issues,
  onChange,
}: QuestionEditorProps) {
  const { t } = useTranslation('studio');
  const baseId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const number = index + 1;
  const text = getQuestionText(question, locale);
  const fallbackText = getQuestionText(question, defaultLocale);
  const isDefault = locale === defaultLocale;
  const hasIssues = issues.length > 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <Card className={cn('space-y-4 p-3 sm:p-4', hasIssues && 'border-destructive/50')}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t('quiz.dragQuestion', { number })}
            className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
          <h4 className="flex-1 font-medium">{t('quiz.questionNumber', { number })}</h4>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('quiz.moveQuestionUp', { number })}
            disabled={index === 0}
            onClick={() => onChange((quiz) => moveQuestion(quiz, index, index - 1))}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('quiz.moveQuestionDown', { number })}
            disabled={index === total - 1}
            onClick={() => onChange((quiz) => moveQuestion(quiz, index, index + 1))}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('quiz.removeQuestion', { number })}
            onClick={() => onChange((quiz) => removeQuestion(quiz, question.id))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${baseId}-prompt`} className="text-sm font-medium">
            {t('quiz.prompt')}
          </label>
          <Textarea
            id={`${baseId}-prompt`}
            className="min-h-20"
            value={text.prompt}
            placeholder={isDefault ? undefined : fallbackText.prompt}
            onChange={(event) =>
              onChange((quiz) =>
                setQuestionText(quiz, question.id, locale, { prompt: event.target.value }),
              )
            }
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('quiz.options')}</legend>
          <p className="text-xs text-muted-foreground">{t('quiz.optionsHint')}</p>
          <ul className="space-y-2">
            {question.options.map((option, optionIndex) => {
              const optionNumber = optionIndex + 1;
              return (
                <li key={option.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${baseId}-correct`}
                    checked={option.isCorrect}
                    className="size-4 shrink-0 accent-primary"
                    aria-label={t('quiz.markCorrect', { number: optionNumber })}
                    onChange={() =>
                      onChange((quiz) => setCorrectOption(quiz, question.id, option.id))
                    }
                  />
                  <Input
                    value={getOptionText(option, locale)}
                    placeholder={isDefault ? undefined : getOptionText(option, defaultLocale)}
                    aria-label={t('quiz.optionText', { number: optionNumber })}
                    onChange={(event) =>
                      onChange((quiz) =>
                        setOptionText(quiz, question.id, option.id, locale, event.target.value),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('quiz.removeOption', { number: optionNumber })}
                    disabled={question.options.length <= MIN_OPTIONS}
                    onClick={() => onChange((quiz) => removeOption(quiz, question.id, option.id))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange((quiz) => addOption(quiz, question.id, locale))}
          >
            <Plus aria-hidden="true" />
            {t('quiz.addOption')}
          </Button>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor={`${baseId}-explanation`} className="text-sm font-medium">
            {t('quiz.explanation')}
          </label>
          <Textarea
            id={`${baseId}-explanation`}
            className="min-h-16"
            value={text.explanation}
            placeholder={isDefault ? undefined : fallbackText.explanation}
            onChange={(event) =>
              onChange((quiz) =>
                setQuestionText(quiz, question.id, locale, { explanation: event.target.value }),
              )
            }
          />
          <p className="text-xs text-muted-foreground">{t('quiz.explanationHint')}</p>
        </div>
      </Card>
    </li>
  );
}

/** Languages in which a question or one of its options has no text. */
function incompleteQuizLocales(quiz: Quiz, locales: Locale[]): Set<Locale> {
  const hasPrompt = (question: QuizQuestion, locale: Locale) =>
    question.translations.some((item) => item.locale === locale && item.prompt.trim() !== '');
  const hasText = (option: QuizQuestion['options'][number], locale: Locale) =>
    option.translations.some((item) => item.locale === locale && item.text.trim() !== '');

  return new Set(
    locales.filter((locale) =>
      quiz.questions.some(
        (question) =>
          !hasPrompt(question, locale) ||
          question.options.some((option) => !hasText(option, locale)),
      ),
    ),
  );
}

/**
 * Quiz builder: passing score, questions with options (one correct answer), explanations and
 * per-language text. Saving is always allowed; problems that would block publishing are listed.
 */
export function QuizBuilder({
  courseId,
  course,
  lesson,
  locales,
  onDirtyChange,
}: {
  courseId: string;
  course: CourseDetail;
  lesson: QuizLesson;
  locales: Locale[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useTranslation(['studio', 'common']);
  const { updateLesson } = useCurriculumMutations(courseId);
  const describeError = useServiceErrorMessage();
  const [draft, setDraft] = useState<Quiz>(lesson.quiz);
  const [locale, setLocale] = useState<Locale>(course.defaultLocale);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(lesson.quiz),
    [draft, lesson.quiz],
  );
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const issues = useMemo(
    () => getQuizIssues(draft, course.defaultLocale),
    [draft, course.defaultLocale],
  );
  const incomplete = useMemo(() => incompleteQuizLocales(draft, locales), [draft, locales]);
  const questionIds = draft.questions.map((question) => question.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const numberOf = (id: string | number) => questionIds.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('studio:quiz.dnd.pickedUp', { number: numberOf(active.id) }),
    onDragOver: ({ over }) =>
      over ? t('studio:quiz.dnd.movedOver', { number: numberOf(over.id) }) : undefined,
    onDragEnd: ({ over }) =>
      over ? t('studio:quiz.dnd.dropped', { number: numberOf(over.id) }) : undefined,
    onDragCancel: ({ active }) => t('studio:quiz.dnd.cancelled', { number: numberOf(active.id) }),
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft((quiz) =>
      moveQuestion(
        quiz,
        questionIds.indexOf(String(active.id)),
        questionIds.indexOf(String(over.id)),
      ),
    );
  };

  const save = async () => {
    try {
      await updateLesson.mutateAsync({ lessonId: lesson.id, input: { quiz: draft } });
      toast.success(t('studio:quiz.savedToast'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const describeIssue = (issue: QuizIssue) =>
    t(`studio:quiz.issues.${issue.code}`, {
      number: issue.questionId ? numberOf(issue.questionId) : 0,
    });

  return (
    <PanelSection title={t('studio:quiz.title')} description={t('studio:quiz.description')}>
      <div className="max-w-xs space-y-1.5">
        <label htmlFor="quiz-passing-score" className="text-sm font-medium">
          {t('studio:quiz.passingScore')}
        </label>
        <Input
          id="quiz-passing-score"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={draft.passingScore}
          onChange={(event) => {
            const parsed = Math.round(Number(event.target.value));
            const clamped = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
            setDraft((quiz) => setPassingScore(quiz, clamped));
          }}
        />
        <p className="text-xs text-muted-foreground">{t('studio:quiz.passingScoreHint')}</p>
      </div>

      {issues.length > 0 ? (
        <div
          role="status"
          className="space-y-1.5 rounded-lg border border-destructive/40 p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {t('studio:quiz.issuesTitle')}
          </p>
          <ul className="list-disc space-y-0.5 ps-6 text-muted-foreground">
            {issues.map((issue) => (
              <li key={`${issue.questionId ?? 'quiz'}-${issue.code}`}>{describeIssue(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <LocaleTabs
        locales={locales}
        value={locale}
        onValueChange={setLocale}
        incomplete={incomplete}
        label={t('studio:quiz.languagesLabel')}
      >
        {(activeLocale) => (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{
              announcements,
              screenReaderInstructions: { draggable: t('studio:quiz.dnd.instructions') },
            }}
          >
            <SortableContext items={questionIds} strategy={verticalListSortingStrategy}>
              <ol className="space-y-3" aria-label={t('studio:quiz.questionsLabel')}>
                {draft.questions.map((question, index) => (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    index={index}
                    total={draft.questions.length}
                    locale={activeLocale}
                    defaultLocale={course.defaultLocale}
                    issues={issues.filter((issue) => issue.questionId === question.id)}
                    onChange={(change) => setDraft(change)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </LocaleTabs>

      {draft.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('studio:quiz.empty')}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDraft((quiz) => addQuestion(quiz, locale))}>
          <Plus aria-hidden="true" />
          {t('studio:quiz.addQuestion')}
        </Button>
        <Button disabled={!isDirty || updateLesson.isPending} onClick={() => void save()}>
          {updateLesson.isPending ? <Spinner /> : null}
          {t('studio:quiz.save')}
        </Button>
        {isDirty ? (
          <Button variant="ghost" onClick={() => setDraft(lesson.quiz)}>
            {t('studio:quiz.discard')}
          </Button>
        ) : null}
      </div>
    </PanelSection>
  );
}
