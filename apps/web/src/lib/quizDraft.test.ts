import type { Quiz } from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import {
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
} from './quizDraft';

const empty: Quiz = { passingScore: 70, questions: [] };

function withQuestions(count: number): Quiz {
  let quiz = empty;
  for (let index = 0; index < count; index++) quiz = addQuestion(quiz, 'pt-BR');
  return quiz;
}

describe('quiz draft', () => {
  it('adds questions with an empty prompt and two empty options, none correct', () => {
    const quiz = addQuestion(empty, 'pt-BR');
    expect(quiz.questions).toHaveLength(1);
    const [question] = quiz.questions;
    expect(question?.translations).toEqual([{ locale: 'pt-BR', prompt: '', explanation: '' }]);
    expect(question?.options).toHaveLength(2);
    expect(question?.options.some((option) => option.isCorrect)).toBe(false);
  });

  it('generates unique ids and never mutates the previous quiz', () => {
    const one = withQuestions(3);
    const ids = one.questions.flatMap((q) => [q.id, ...q.options.map((o) => o.id)]);
    expect(new Set(ids).size).toBe(ids.length);

    const two = setPassingScore(one, 90);
    expect(one.passingScore).toBe(70);
    expect(two.passingScore).toBe(90);
  });

  it('edits the text per language, creating the translation when missing', () => {
    const base = addQuestion(empty, 'pt-BR');
    const id = base.questions[0]!.id;
    const optionId = base.questions[0]!.options[0]!.id;

    let quiz = setQuestionText(base, id, 'pt-BR', { prompt: 'Qual?' });
    quiz = setQuestionText(quiz, id, 'en', { prompt: 'Which?', explanation: 'Because' });
    quiz = setOptionText(quiz, id, optionId, 'en', 'Yes');

    const question = quiz.questions[0]!;
    expect(getQuestionText(question, 'pt-BR')).toMatchObject({ prompt: 'Qual?', explanation: '' });
    expect(getQuestionText(question, 'en')).toMatchObject({
      prompt: 'Which?',
      explanation: 'Because',
    });
    expect(getOptionText(question.options[0]!, 'en')).toBe('Yes');
    expect(getOptionText(question.options[0]!, 'pt-BR')).toBe('');
    expect(getOptionText(question.options[1]!, 'en')).toBe('');
  });

  it('keeps exactly one correct option per question', () => {
    const base = addQuestion(empty, 'pt-BR');
    const question = base.questions[0]!;
    let quiz = setCorrectOption(base, question.id, question.options[0]!.id);
    quiz = setCorrectOption(quiz, question.id, question.options[1]!.id);
    expect(quiz.questions[0]?.options.map((option) => option.isCorrect)).toEqual([false, true]);
  });

  it('adds options and only removes them while more than two remain', () => {
    const base = addQuestion(empty, 'pt-BR');
    const question = base.questions[0]!;

    // the minimum of two options is protected
    expect(removeOption(base, question.id, question.options[0]!.id).questions[0]?.options).toEqual(
      question.options,
    );

    const three = addOption(base, question.id, 'pt-BR');
    expect(three.questions[0]?.options).toHaveLength(3);
    const back = removeOption(three, question.id, three.questions[0]!.options[2]!.id);
    expect(back.questions[0]?.options).toHaveLength(2);
  });

  it('removes and reorders questions', () => {
    const quiz = withQuestions(3);
    const [a, b, c] = quiz.questions.map((q) => q.id) as [string, string, string];
    expect(moveQuestion(quiz, 0, 2).questions.map((q) => q.id)).toEqual([b, c, a]);
    expect(removeQuestion(quiz, b).questions.map((q) => q.id)).toEqual([a, c]);
  });
});
