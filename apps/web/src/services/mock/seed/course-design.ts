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

const COURSE_ID = 'course-design';

/** Course with sequential order and a partial English translation (only the beginning is translated). */
export function buildDesignCourse(createdAt: string): CourseDetail {
  return {
    id: COURSE_ID,
    slug: 'design-de-interfaces-na-pratica',
    status: 'published',
    coverImageUrl: null,
    instructorId: 'user-beatriz',
    defaultLocale: 'pt-BR',
    sequentialOrder: true,
    certificateTemplate: certificateTemplate('Beatriz Nogueira'),
    createdAt,
    updatedAt: createdAt,
    translations: courseTranslations({
      'pt-BR': {
        title: 'Design de Interfaces na Prática',
        description:
          'Um passo a passo para projetar telas claras e acessíveis: do alinhamento e da tipografia até um protótipo navegável. Cada aula libera a próxima, para você construir o raciocínio em ordem.',
        learningOutcomes: [
          'Aplicar hierarquia visual, espaçamento e tipografia',
          'Escolher paletas com contraste adequado',
          'Montar layouts responsivos com grids',
          'Criar e testar um protótipo navegável',
        ],
      },
      en: {
        title: 'Interface Design in Practice',
        description:
          'A step-by-step guide to designing clear and accessible screens: from alignment and typography to a clickable prototype. Each lesson unlocks the next one so you build your reasoning in order.',
        learningOutcomes: [
          'Apply visual hierarchy, spacing and typography',
          'Choose palettes with adequate contrast',
          'Build responsive layouts with grids',
          'Create and test a clickable prototype',
        ],
      },
    }),
    modules: [
      courseModule(
        'mod-design-1',
        COURSE_ID,
        0,
        { 'pt-BR': 'Fundamentos visuais', en: 'Visual fundamentals' },
        [
          videoLesson({
            id: 'les-design-1-1',
            durationSeconds: 480,
            captions: ['pt-BR', 'en'],
            title: { 'pt-BR': 'O que torna uma interface boa', en: 'What makes an interface good' },
            content: {
              'pt-BR':
                'Clareza, consistência e feedback: os três critérios que usaremos em todo o curso.',
              en: 'Clarity, consistency and feedback: the three criteria we will use throughout the course.',
            },
          }),
          textLesson({
            id: 'les-design-1-2',
            durationSeconds: 660,
            title: { 'pt-BR': 'Tipografia e hierarquia', en: 'Typography and hierarchy' },
            content: {
              'pt-BR':
                '## Hierarquia\n\nO olhar percorre a tela por tamanho, peso e contraste. Defina **no máximo três níveis** de texto por tela.\n\n- Título: chama a atenção\n- Corpo: sustenta a leitura\n- Rótulo: apoia, sem competir',
              en: '## Hierarchy\n\nThe eye moves across the screen by size, weight and contrast. Define **at most three levels** of text per screen.\n\n- Title: draws attention\n- Body: supports reading\n- Label: assists without competing',
            },
          }),
          textLesson({
            id: 'les-design-1-3',
            durationSeconds: 540,
            title: { 'pt-BR': 'Cor e contraste', en: 'Color and contrast' },
            content: {
              'pt-BR':
                '## Contraste mínimo\n\nTexto normal precisa de razão de contraste de pelo menos **4,5:1** (WCAG AA). Teste suas combinações antes de aprovar uma paleta.',
              en: '## Minimum contrast\n\nNormal text needs a contrast ratio of at least **4.5:1** (WCAG AA). Test your combinations before approving a palette.',
            },
          }),
          quizLesson({
            id: 'les-design-1-4',
            durationSeconds: 240,
            passingScore: 60,
            title: { 'pt-BR': 'Quiz: fundamentos visuais', en: 'Quiz: visual fundamentals' },
            content: {
              'pt-BR': 'Verifique o que aprendeu antes de seguir para layouts.',
              en: 'Check what you learned before moving on to layouts.',
            },
            questions: [
              question(
                'q-design-1',
                {
                  'pt-BR': {
                    prompt: 'Qual razão de contraste mínima o WCAG AA pede para texto normal?',
                    explanation:
                      'O nível AA exige 4,5:1 para texto normal e 3:1 para texto grande.',
                  },
                  en: {
                    prompt: 'What minimum contrast ratio does WCAG AA require for normal text?',
                    explanation: 'Level AA requires 4.5:1 for normal text and 3:1 for large text.',
                  },
                },
                [
                  { id: 'q-design-1-a', text: { 'pt-BR': '2:1', en: '2:1' } },
                  { id: 'q-design-1-b', correct: true, text: { 'pt-BR': '4,5:1', en: '4.5:1' } },
                  { id: 'q-design-1-c', text: { 'pt-BR': '7:1', en: '7:1' } },
                ],
              ),
              question(
                'q-design-2',
                {
                  'pt-BR': {
                    prompt: 'Quantos níveis de texto são recomendados por tela?',
                    explanation: 'Poucos níveis mantêm a hierarquia legível e a tela organizada.',
                  },
                  en: {
                    prompt: 'How many text levels are recommended per screen?',
                    explanation: 'Few levels keep the hierarchy readable and the screen organized.',
                  },
                },
                [
                  {
                    id: 'q-design-2-a',
                    correct: true,
                    text: { 'pt-BR': 'No máximo três', en: 'At most three' },
                  },
                  {
                    id: 'q-design-2-b',
                    text: { 'pt-BR': 'Pelo menos sete', en: 'At least seven' },
                  },
                  { id: 'q-design-2-c', text: { 'pt-BR': 'Apenas um', en: 'Only one' } },
                ],
              ),
            ],
          }),
        ],
      ),
      courseModule(
        'mod-design-2',
        COURSE_ID,
        1,
        { 'pt-BR': 'Layout e grids', en: 'Layout and grids' },
        [
          videoLesson({
            id: 'les-design-2-1',
            durationSeconds: 720,
            title: { 'pt-BR': 'Grids de 12 colunas' },
            content: {
              'pt-BR':
                'Como estruturar páginas com grids e por que o espaçamento precisa seguir um ritmo.',
            },
          }),
          textLesson({
            id: 'les-design-2-2',
            durationSeconds: 600,
            title: { 'pt-BR': 'Layouts responsivos' },
            content: {
              'pt-BR':
                '## Mobile primeiro\n\nComece pela tela menor, que força a priorizar o essencial, e acrescente espaço conforme a largura cresce.',
            },
          }),
          fileLesson({
            id: 'les-design-2-3',
            durationSeconds: 300,
            title: { 'pt-BR': 'Modelo de grid para download' },
            content: {
              'pt-BR': 'Arquivo com grids prontos para 375, 768 e 1280 pixels de largura.',
            },
            attachments: [attachment('att-design-1', 'grids-responsivos.fig', 910_000)],
          }),
        ],
      ),
      courseModule('mod-design-3', COURSE_ID, 2, { 'pt-BR': 'Prototipação' }, [
        videoLesson({
          id: 'les-design-3-1',
          durationSeconds: 840,
          title: { 'pt-BR': 'Do rascunho ao protótipo navegável' },
          content: {
            'pt-BR': 'Passamos de um esboço em papel a um protótipo clicável em menos de uma hora.',
          },
          attachments: [attachment('att-design-2', 'checklist-prototipo.pdf', 120_000)],
        }),
        textLesson({
          id: 'les-design-3-2',
          durationSeconds: 480,
          title: { 'pt-BR': 'Testes de usabilidade rápidos' },
          content: {
            'pt-BR':
              '## Cinco pessoas bastam\n\nUm teste com cinco pessoas costuma revelar a maior parte dos problemas. Peça que executem uma tarefa **pensando em voz alta** e anote onde hesitam.',
          },
        }),
        quizLesson({
          id: 'les-design-3-3',
          durationSeconds: 240,
          passingScore: 60,
          title: { 'pt-BR': 'Quiz final' },
          content: { 'pt-BR': 'Revise grids, protótipos e testes de usabilidade.' },
          questions: [
            question(
              'q-design-3',
              {
                'pt-BR': {
                  prompt: 'O que significa projetar mobile primeiro?',
                  explanation: 'Começar pela tela menor força a priorizar o conteúdo essencial.',
                },
              },
              [
                {
                  id: 'q-design-3-a',
                  correct: true,
                  text: { 'pt-BR': 'Começar pela tela menor e expandir' },
                },
                { id: 'q-design-3-b', text: { 'pt-BR': 'Projetar apenas para celulares' } },
                { id: 'q-design-3-c', text: { 'pt-BR': 'Esconder conteúdo no desktop' } },
              ],
            ),
            question(
              'q-design-4',
              {
                'pt-BR': {
                  prompt: 'Qual a vantagem de pedir que o usuário pense em voz alta no teste?',
                  explanation:
                    'Isso revela o raciocínio e os pontos de dúvida que não aparecem só observando.',
                },
              },
              [
                { id: 'q-design-4-a', text: { 'pt-BR': 'Acelerar o teste' } },
                {
                  id: 'q-design-4-b',
                  correct: true,
                  text: { 'pt-BR': 'Entender o raciocínio e as dúvidas' },
                },
                { id: 'q-design-4-c', text: { 'pt-BR': 'Evitar gravação' } },
              ],
            ),
          ],
        }),
      ]),
    ],
  };
}
