import type { CourseDetail } from '@opencourse/shared';
import {
  attachment,
  certificateTemplate,
  courseModule,
  courseTranslations,
  fileLesson,
  question,
  quizLesson,
  textLesson,
  videoLesson,
} from './builders';

const COURSE_ID = 'course-javascript';

/** Course fully translated into pt-BR and en. */
export function buildJavascriptCourse(createdAt: string): CourseDetail {
  return {
    id: COURSE_ID,
    slug: 'fundamentos-de-javascript',
    status: 'published',
    coverImageUrl: null,
    instructorId: 'user-rafael',
    defaultLocale: 'pt-BR',
    sequentialOrder: false,
    certificateTemplate: certificateTemplate('Rafael Teixeira'),
    createdAt,
    updatedAt: createdAt,
    translations: courseTranslations({
      'pt-BR': {
        title: 'Fundamentos de JavaScript Moderno',
        description:
          'Aprenda a linguagem da web do zero, com exemplos práticos de variáveis, funções, escopo e código assíncrono. Ao final você escreve programas reais e entende o que acontece por baixo.',
        learningOutcomes: [
          'Declarar variáveis e escolher o tipo certo para cada dado',
          'Escrever funções claras e entender escopo e closures',
          'Consumir APIs com Promises e async/await',
          'Depurar erros comuns com as ferramentas do navegador',
        ],
      },
      en: {
        title: 'Modern JavaScript Fundamentals',
        description:
          'Learn the language of the web from scratch, with practical examples of variables, functions, scope and asynchronous code. By the end you will write real programs and understand what happens under the hood.',
        learningOutcomes: [
          'Declare variables and pick the right type for each piece of data',
          'Write clear functions and understand scope and closures',
          'Consume APIs with Promises and async/await',
          'Debug common errors using the browser tools',
        ],
      },
    }),
    modules: [
      courseModule(
        'mod-js-1',
        COURSE_ID,
        0,
        { 'pt-BR': 'Primeiros passos', en: 'Getting started' },
        [
          videoLesson({
            id: 'les-js-1-1',
            durationSeconds: 320,
            captions: ['pt-BR', 'en'],
            title: { 'pt-BR': 'Boas-vindas e como estudar', en: 'Welcome and how to study' },
            content: {
              'pt-BR':
                'Apresentação do curso, do ambiente de estudo e de como tirar o máximo de cada aula.',
              en: 'Course introduction, the study environment and how to get the most out of each lesson.',
            },
          }),
          textLesson({
            id: 'les-js-1-2',
            durationSeconds: 720,
            title: {
              'pt-BR': 'Variáveis, tipos e operadores',
              en: 'Variables, types and operators',
            },
            content: {
              'pt-BR':
                '## Variáveis\n\nUse `const` por padrão e `let` quando o valor precisar mudar. Evite `var`.\n\n```js\nconst nome = "Ana";\nlet idade = 31;\nidade += 1;\n```\n\n## Tipos primitivos\n\n- `string`, `number`, `boolean`\n- `null` e `undefined`\n- `bigint` e `symbol`\n\nO operador `typeof` ajuda a inspecionar o tipo de um valor.',
              en: '## Variables\n\nUse `const` by default and `let` when the value has to change. Avoid `var`.\n\n```js\nconst name = "Ana";\nlet age = 31;\nage += 1;\n```\n\n## Primitive types\n\n- `string`, `number`, `boolean`\n- `null` and `undefined`\n- `bigint` and `symbol`\n\nThe `typeof` operator helps inspect the type of a value.',
            },
          }),
          fileLesson({
            id: 'les-js-1-3',
            durationSeconds: 600,
            title: { 'pt-BR': 'Exercícios do módulo 1', en: 'Module 1 exercises' },
            content: {
              'pt-BR':
                'Baixe a lista de exercícios e o código inicial. Resolva antes de seguir para o próximo módulo.',
              en: 'Download the exercise list and the starter code. Solve them before moving on to the next module.',
            },
            attachments: [
              attachment('att-js-1', 'exercicios-modulo-1.pdf', 482_000),
              attachment('att-js-2', 'codigo-inicial.zip', 36_500),
            ],
          }),
          quizLesson({
            id: 'les-js-1-4',
            durationSeconds: 300,
            passingScore: 70,
            title: { 'pt-BR': 'Quiz: tipos e variáveis', en: 'Quiz: types and variables' },
            content: {
              'pt-BR': 'Três perguntas rápidas para fixar o conteúdo. Nota mínima de 70%.',
              en: 'Three quick questions to reinforce the content. Minimum score of 70%.',
            },
            questions: [
              question(
                'q-js-1',
                {
                  'pt-BR': {
                    prompt: 'Qual palavra-chave declara uma variável que não pode ser reatribuída?',
                    explanation:
                      '`const` impede a reatribuição, embora o conteúdo de objetos ainda possa mudar.',
                  },
                  en: {
                    prompt: 'Which keyword declares a variable that cannot be reassigned?',
                    explanation:
                      '`const` prevents reassignment, although object contents can still change.',
                  },
                },
                [
                  { id: 'q-js-1-a', correct: true, text: { 'pt-BR': 'const', en: 'const' } },
                  { id: 'q-js-1-b', text: { 'pt-BR': 'let', en: 'let' } },
                  { id: 'q-js-1-c', text: { 'pt-BR': 'var', en: 'var' } },
                ],
              ),
              question(
                'q-js-2',
                {
                  'pt-BR': {
                    prompt: 'O que `typeof null` retorna?',
                    explanation:
                      'É um comportamento histórico da linguagem: `typeof null` retorna "object".',
                  },
                  en: {
                    prompt: 'What does `typeof null` return?',
                    explanation:
                      'It is a historical quirk of the language: `typeof null` returns "object".',
                  },
                },
                [
                  { id: 'q-js-2-a', text: { 'pt-BR': '"null"', en: '"null"' } },
                  { id: 'q-js-2-b', correct: true, text: { 'pt-BR': '"object"', en: '"object"' } },
                  { id: 'q-js-2-c', text: { 'pt-BR': '"undefined"', en: '"undefined"' } },
                ],
              ),
              question(
                'q-js-3',
                {
                  'pt-BR': {
                    prompt: 'Qual é o resultado de `"5" + 3`?',
                    explanation:
                      'O operador `+` concatena quando um dos lados é string, resultando em "53".',
                  },
                  en: {
                    prompt: 'What is the result of `"5" + 3`?',
                    explanation:
                      'The `+` operator concatenates when one side is a string, resulting in "53".',
                  },
                },
                [
                  { id: 'q-js-3-a', text: { 'pt-BR': '8', en: '8' } },
                  { id: 'q-js-3-b', correct: true, text: { 'pt-BR': '"53"', en: '"53"' } },
                  { id: 'q-js-3-c', text: { 'pt-BR': 'NaN', en: 'NaN' } },
                ],
              ),
            ],
          }),
        ],
      ),
      courseModule(
        'mod-js-2',
        COURSE_ID,
        1,
        { 'pt-BR': 'Funções e escopo', en: 'Functions and scope' },
        [
          videoLesson({
            id: 'les-js-2-1',
            durationSeconds: 870,
            captions: ['pt-BR', 'en'],
            title: {
              'pt-BR': 'Funções: declaração e expressão',
              en: 'Functions: declaration and expression',
            },
            content: {
              'pt-BR': 'Como declarar funções, quando usar cada forma e o que muda no hoisting.',
              en: 'How to declare functions, when to use each form and what changes with hoisting.',
            },
            attachments: [attachment('att-js-3', 'slides-funcoes.pdf', 1_240_000)],
          }),
          textLesson({
            id: 'les-js-2-2',
            durationSeconds: 840,
            title: { 'pt-BR': 'Escopo, closures e hoisting', en: 'Scope, closures and hoisting' },
            content: {
              'pt-BR':
                '## Escopo\n\nVariáveis declaradas com `let` e `const` vivem no bloco onde foram criadas.\n\n## Closures\n\nUma função lembra das variáveis do escopo em que nasceu:\n\n```js\nfunction contador() {\n  let total = 0;\n  return () => ++total;\n}\n```\n\nCada chamada de `contador()` cria um total independente.',
              en: '## Scope\n\nVariables declared with `let` and `const` live in the block where they were created.\n\n## Closures\n\nA function remembers the variables of the scope where it was born:\n\n```js\nfunction counter() {\n  let total = 0;\n  return () => ++total;\n}\n```\n\nEach call to `counter()` creates an independent total.',
            },
          }),
          videoLesson({
            id: 'les-js-2-3',
            durationSeconds: 670,
            captions: ['pt-BR', 'en'],
            title: { 'pt-BR': 'Arrow functions na prática', en: 'Arrow functions in practice' },
            content: {
              'pt-BR':
                'Sintaxe curta, retorno implícito e o comportamento de `this` nas arrow functions.',
              en: 'Short syntax, implicit return and how `this` behaves in arrow functions.',
            },
          }),
        ],
      ),
      courseModule(
        'mod-js-3',
        COURSE_ID,
        2,
        { 'pt-BR': 'Código assíncrono', en: 'Asynchronous code' },
        [
          videoLesson({
            id: 'les-js-3-1',
            durationSeconds: 900,
            captions: ['pt-BR', 'en'],
            title: { 'pt-BR': 'Promises do zero', en: 'Promises from scratch' },
            content: {
              'pt-BR':
                'O que é uma Promise, seus estados e como encadear operações com `then` e `catch`.',
              en: 'What a Promise is, its states and how to chain operations with `then` and `catch`.',
            },
          }),
          textLesson({
            id: 'les-js-3-2',
            durationSeconds: 780,
            title: { 'pt-BR': 'async e await', en: 'async and await' },
            content: {
              'pt-BR':
                '## Lendo código assíncrono como síncrono\n\n```js\nasync function carregarCurso(id) {\n  const resposta = await fetch(`/api/cursos/${id}`);\n  if (!resposta.ok) throw new Error("Falha ao carregar");\n  return resposta.json();\n}\n```\n\nUse `try/catch` para tratar erros e `Promise.all` para rodar chamadas em paralelo.',
              en: '## Reading asynchronous code like synchronous code\n\n```js\nasync function loadCourse(id) {\n  const response = await fetch(`/api/courses/${id}`);\n  if (!response.ok) throw new Error("Failed to load");\n  return response.json();\n}\n```\n\nUse `try/catch` to handle errors and `Promise.all` to run calls in parallel.',
            },
          }),
          quizLesson({
            id: 'les-js-3-3',
            durationSeconds: 300,
            passingScore: 70,
            title: { 'pt-BR': 'Quiz final', en: 'Final quiz' },
            content: {
              'pt-BR': 'Revise funções, escopo e código assíncrono. Nota mínima de 70%.',
              en: 'Review functions, scope and asynchronous code. Minimum score of 70%.',
            },
            questions: [
              question(
                'q-js-4',
                {
                  'pt-BR': {
                    prompt: 'O que uma função `async` sempre retorna?',
                    explanation:
                      'Funções `async` sempre devolvem uma Promise, mesmo que você retorne um valor simples.',
                  },
                  en: {
                    prompt: 'What does an `async` function always return?',
                    explanation:
                      '`async` functions always return a Promise, even if you return a plain value.',
                  },
                },
                [
                  { id: 'q-js-4-a', text: { 'pt-BR': 'Um valor simples', en: 'A plain value' } },
                  {
                    id: 'q-js-4-b',
                    correct: true,
                    text: { 'pt-BR': 'Uma Promise', en: 'A Promise' },
                  },
                  { id: 'q-js-4-c', text: { 'pt-BR': 'Um callback', en: 'A callback' } },
                ],
              ),
              question(
                'q-js-5',
                {
                  'pt-BR': {
                    prompt: 'Como executar várias requisições independentes em paralelo?',
                    explanation:
                      '`Promise.all` dispara todas ao mesmo tempo e espera que todas terminem.',
                  },
                  en: {
                    prompt: 'How do you run several independent requests in parallel?',
                    explanation:
                      '`Promise.all` starts them all at once and waits for all of them to finish.',
                  },
                },
                [
                  {
                    id: 'q-js-5-a',
                    text: { 'pt-BR': 'Usando await em sequência', en: 'Using await in sequence' },
                  },
                  {
                    id: 'q-js-5-b',
                    correct: true,
                    text: { 'pt-BR': 'Com Promise.all', en: 'With Promise.all' },
                  },
                  { id: 'q-js-5-c', text: { 'pt-BR': 'Com setTimeout', en: 'With setTimeout' } },
                ],
              ),
            ],
          }),
        ],
      ),
    ],
  };
}
