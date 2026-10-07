import type { Locale, Quiz } from '@opencourse/shared';
import { CircleCheck, CircleX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuizAttempts, useSubmitQuiz } from '@/hooks/queries';
import { localizeExplanation, localizeOption, localizeQuestion } from '@/lib/content';
import { useFormatters } from '@/lib/intl';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { cn } from '@/lib/utils';
import type { QuizSubmission } from '@/services';

interface QuizLessonProps {
  courseId: string;
  lessonId: string;
  quiz: Quiz;
  locale: Locale;
  defaultLocale: Locale;
  timeZone: string;
}

/** Multiple-choice quiz with per-question feedback, minimum score and attempt history. */
export function QuizLesson({
  courseId,
  lessonId,
  quiz,
  locale,
  defaultLocale,
  timeZone,
}: QuizLessonProps) {
  const { t } = useTranslation(['player', 'common']);
  const { formatDate } = useFormatters(timeZone);
  const describeError = useServiceErrorMessage();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<QuizSubmission | null>(null);
  const attempts = useQuizAttempts(lessonId, true);
  const submit = useSubmitQuiz(courseId, lessonId);

  const answeredCount = quiz.questions.filter((question) => answers[question.id]).length;
  const isComplete = answeredCount === quiz.questions.length;
  const result = submission?.feedback;

  if (quiz.questions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('quiz.noQuestions')}</p>;
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submit.mutate(answers, {
      onSuccess: (data) => {
        setSubmission(data);
        if (data.feedback.passed) toast.success(t('quiz.passedToast'));
      },
      onError: (error) => toast.error(describeError(error)),
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <p className="text-sm text-muted-foreground">
        {t('quiz.intro', { count: quiz.questions.length, passingScore: quiz.passingScore })}
      </p>

      {result ? (
        <Card
          role="status"
          className={cn('space-y-1 p-4', result.passed ? 'border-primary' : 'border-destructive')}
        >
          <p className="flex items-center gap-2 text-lg font-semibold">
            {result.passed ? (
              <CircleCheck className="size-5 text-primary" aria-hidden="true" />
            ) : (
              <CircleX className="size-5 text-destructive" aria-hidden="true" />
            )}
            {result.passed ? t('quiz.passedTitle') : t('quiz.failedTitle')}
          </p>
          <p className="text-sm">
            {t('quiz.resultSummary', {
              score: result.score,
              correct: result.correctCount,
              total: result.totalQuestions,
            })}
          </p>
          {!result.passed ? (
            <p className="text-sm text-muted-foreground">
              {t('quiz.failedHint', { passingScore: quiz.passingScore })}
            </p>
          ) : null}
        </Card>
      ) : null}

      <ol className="space-y-6">
        {quiz.questions.map((question, index) => {
          const content = localizeQuestion(question, locale, defaultLocale);
          const questionResult = result?.results[question.id];
          const explanation = questionResult
            ? localizeExplanation(questionResult.explanation, locale, defaultLocale)
            : '';
          return (
            <li key={question.id}>
              <fieldset disabled={result !== undefined} className="min-w-0 space-y-3">
                <legend className="font-medium">
                  <span className="me-2 font-mono text-muted-foreground">{index + 1}.</span>
                  {content.prompt}
                </legend>
                <div className="space-y-2">
                  {question.options.map((option) => {
                    const isSelected = answers[question.id] === option.id;
                    // the right option is only revealed once the attempt passed; before that a
                    // right answer shows through the student's own pick
                    const isCorrectOption =
                      questionResult?.correctOptionId === option.id ||
                      (questionResult?.isCorrect === true && isSelected);
                    const isWrongSelection =
                      questionResult && isSelected && questionResult.isCorrect === false;
                    return (
                      <label
                        key={option.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                          isSelected && !questionResult && 'border-primary bg-accent',
                          isCorrectOption && 'border-primary bg-accent',
                          isWrongSelection && 'border-destructive',
                          result && 'cursor-default',
                        )}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option.id}
                          checked={isSelected}
                          onChange={() =>
                            setAnswers((current) => ({ ...current, [question.id]: option.id }))
                          }
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span className="flex-1">
                          {localizeOption(option, locale, defaultLocale)}
                        </span>
                        {isCorrectOption ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <CircleCheck className="size-4" aria-hidden="true" />
                            {t('quiz.correctOption')}
                          </span>
                        ) : null}
                        {isWrongSelection ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <CircleX className="size-4" aria-hidden="true" />
                            {t('quiz.yourAnswer')}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                {questionResult && explanation ? (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    <span className="font-medium">{t('quiz.explanation')}: </span>
                    {explanation}
                  </p>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        {result ? (
          <Button
            variant="outline"
            onClick={() => {
              setSubmission(null);
              setAnswers({});
            }}
          >
            {t('quiz.retry')}
          </Button>
        ) : (
          <Button type="submit" disabled={!isComplete || submit.isPending}>
            {submit.isPending ? <Spinner /> : null}
            {t('quiz.submit')}
          </Button>
        )}
        {!result && !isComplete ? (
          <p className="text-sm text-muted-foreground">
            {t('quiz.answerAll', { answered: answeredCount, total: quiz.questions.length })}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="attempts-heading" className="space-y-2 border-t pt-4">
        <h3 id="attempts-heading" className="text-sm font-medium">
          {t('quiz.attemptsTitle')}
        </h3>
        {attempts.isPending ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t('common:states.loading')}</span>
            <Skeleton className="h-9 w-full" />
          </div>
        ) : attempts.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-destructive">{t('common:states.error.description')}</span>
            <Button size="sm" variant="outline" onClick={() => void attempts.refetch()}>
              {t('common:actions.retry')}
            </Button>
          </div>
        ) : attempts.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('quiz.noAttempts')}</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-surface text-sm">
            {attempts.data.map((attempt, index) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <span className="font-mono text-muted-foreground">#{index + 1}</span>
                <span className="font-mono">{attempt.score}%</span>
                <Badge variant={attempt.passed ? 'success' : 'warning'}>
                  {attempt.passed ? t('quiz.statusPassed') : t('quiz.statusFailed')}
                </Badge>
                <span className="ms-auto text-xs text-muted-foreground">
                  {formatDate(new Date(attempt.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
