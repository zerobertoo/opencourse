import type { CourseDetail } from '@opencourse/shared';
import {
  attachment,
  courseModule,
  courseTranslations,
  fileLesson,
  question,
  quizLesson,
  textLesson,
  videoLesson,
} from './builders';

/** Curso publicado, somente em português. */
export function buildSqlCourse(createdAt: string): CourseDetail {
  const id = 'course-sql';
  return {
    id,
    slug: 'analise-de-dados-com-sql',
    status: 'published',
    coverImageUrl: null,
    instructorId: 'user-rafael',
    defaultLocale: 'pt-BR',
    sequentialOrder: false,
    createdAt,
    updatedAt: createdAt,
    translations: courseTranslations({
      'pt-BR': {
        title: 'Introdução à Análise de Dados com SQL',
        description:
          'Consulte, filtre e resuma dados de um banco relacional usando SQL. O curso parte de uma base de vendas fictícia e termina com um relatório completo.',
        learningOutcomes: [
          'Escrever consultas com SELECT, WHERE e ORDER BY',
          'Combinar tabelas com JOIN',
          'Resumir dados com GROUP BY e funções de agregação',
          'Montar um relatório mensal de vendas',
        ],
      },
    }),
    modules: [
      courseModule('mod-sql-1', id, 0, { 'pt-BR': 'Consultas básicas' }, [
        videoLesson({
          id: 'les-sql-1-1',
          durationSeconds: 540,
          title: { 'pt-BR': 'Seu primeiro SELECT' },
          content: { 'pt-BR': 'Conhecemos a base de vendas e escrevemos as primeiras consultas.' },
        }),
        textLesson({
          id: 'les-sql-1-2',
          durationSeconds: 600,
          title: { 'pt-BR': 'Filtrando e ordenando resultados' },
          content: {
            'pt-BR':
              '## WHERE e ORDER BY\n\n```sql\nSELECT cliente, total\nFROM pedidos\nWHERE total > 500\nORDER BY total DESC;\n```\n\nCombine condições com `AND` e `OR`, usando parênteses para deixar a intenção clara.',
          },
        }),
        quizLesson({
          id: 'les-sql-1-3',
          durationSeconds: 240,
          passingScore: 60,
          title: { 'pt-BR': 'Quiz: consultas básicas' },
          content: { 'pt-BR': 'Confira o que você aprendeu sobre SELECT e filtros.' },
          questions: [
            question(
              'q-sql-1',
              {
                'pt-BR': {
                  prompt: 'Qual cláusula filtra linhas?',
                  explanation: '`WHERE` filtra as linhas antes de qualquer agrupamento.',
                },
              },
              [
                { id: 'q-sql-1-a', correct: true, text: { 'pt-BR': 'WHERE' } },
                { id: 'q-sql-1-b', text: { 'pt-BR': 'ORDER BY' } },
                { id: 'q-sql-1-c', text: { 'pt-BR': 'LIMIT' } },
              ],
            ),
            question(
              'q-sql-2',
              {
                'pt-BR': {
                  prompt: 'Como ordenar do maior para o menor?',
                  explanation: '`DESC` inverte a ordem padrão, que é crescente.',
                },
              },
              [
                { id: 'q-sql-2-a', text: { 'pt-BR': 'ORDER BY total ASC' } },
                { id: 'q-sql-2-b', correct: true, text: { 'pt-BR': 'ORDER BY total DESC' } },
                { id: 'q-sql-2-c', text: { 'pt-BR': 'SORT total' } },
              ],
            ),
          ],
        }),
      ]),
      courseModule('mod-sql-2', id, 1, { 'pt-BR': 'Junções e agregações' }, [
        videoLesson({
          id: 'les-sql-2-1',
          durationSeconds: 780,
          title: { 'pt-BR': 'Combinando tabelas com JOIN' },
          content: { 'pt-BR': 'INNER JOIN, LEFT JOIN e como escolher entre eles.' },
        }),
        textLesson({
          id: 'les-sql-2-2',
          durationSeconds: 660,
          title: { 'pt-BR': 'GROUP BY e funções de agregação' },
          content: {
            'pt-BR':
              '## Resumindo dados\n\n```sql\nSELECT categoria, COUNT(*) AS pedidos, SUM(total) AS receita\nFROM pedidos\nGROUP BY categoria;\n```\n\nToda coluna fora de uma agregação precisa aparecer no `GROUP BY`.',
          },
        }),
        fileLesson({
          id: 'les-sql-2-3',
          durationSeconds: 900,
          title: { 'pt-BR': 'Projeto: relatório mensal de vendas' },
          content: { 'pt-BR': 'Baixe a base de exemplo e o roteiro do projeto final.' },
          attachments: [
            attachment('att-sql-1', 'base-vendas.sql', 214_000),
            attachment('att-sql-2', 'roteiro-projeto.pdf', 98_000),
          ],
        }),
      ]),
    ],
  };
}

/** Curso em rascunho. */
export function buildPhotographyCourse(createdAt: string): CourseDetail {
  const id = 'course-photography';
  return {
    id,
    slug: 'fotografia-para-iniciantes',
    status: 'draft',
    coverImageUrl: null,
    instructorId: 'user-beatriz',
    defaultLocale: 'pt-BR',
    sequentialOrder: false,
    createdAt,
    updatedAt: createdAt,
    translations: courseTranslations({
      'pt-BR': {
        title: 'Fotografia para Iniciantes',
        description:
          'Entenda sua câmera, domine a exposição e crie composições mais fortes usando apenas o equipamento que você já tem.',
        learningOutcomes: [
          'Equilibrar abertura, velocidade e ISO',
          'Compor cenas com regra dos terços e linhas guia',
          'Aproveitar a luz natural',
        ],
      },
    }),
    modules: [
      courseModule('mod-photo-1', id, 0, { 'pt-BR': 'Câmera e exposição' }, [
        videoLesson({
          id: 'les-photo-1-1',
          durationSeconds: 600,
          title: { 'pt-BR': 'O triângulo da exposição' },
          content: { 'pt-BR': 'Abertura, velocidade e ISO trabalhando juntos.' },
        }),
        textLesson({
          id: 'les-photo-1-2',
          durationSeconds: 420,
          title: { 'pt-BR': 'Modos automáticos e manuais' },
          content: {
            'pt-BR':
              '## Quando sair do automático\n\nUse o modo manual quando a luz da cena enganar o medidor da câmera.',
          },
        }),
      ]),
      courseModule('mod-photo-2', id, 1, { 'pt-BR': 'Composição' }, [
        videoLesson({
          id: 'les-photo-2-1',
          durationSeconds: 540,
          title: { 'pt-BR': 'Regra dos terços e linhas guia' },
          content: { 'pt-BR': 'Como posicionar o assunto e conduzir o olhar.' },
        }),
        fileLesson({
          id: 'les-photo-2-2',
          durationSeconds: 300,
          title: { 'pt-BR': 'Guia de exercícios de composição' },
          content: { 'pt-BR': 'Dez desafios para praticar durante a semana.' },
          attachments: [attachment('att-photo-1', 'desafios-composicao.pdf', 350_000)],
        }),
      ]),
    ],
  };
}

/** Curso arquivado. */
export function buildTimeManagementCourse(createdAt: string): CourseDetail {
  const id = 'course-time';
  return {
    id,
    slug: 'gestao-de-tempo-para-equipes-remotas',
    status: 'archived',
    coverImageUrl: null,
    instructorId: 'user-rafael',
    defaultLocale: 'pt-BR',
    sequentialOrder: false,
    createdAt,
    updatedAt: createdAt,
    translations: courseTranslations({
      'pt-BR': {
        title: 'Gestão de Tempo para Equipes Remotas',
        description:
          'Rituais, combinados e ferramentas para equipes distribuídas entregarem com previsibilidade e sem sobrecarga.',
        learningOutcomes: [
          'Definir combinados de comunicação assíncrona',
          'Planejar a semana com blocos de foco',
          'Conduzir reuniões curtas e objetivas',
        ],
      },
    }),
    modules: [
      courseModule('mod-time-1', id, 0, { 'pt-BR': 'Combinados da equipe' }, [
        videoLesson({
          id: 'les-time-1-1',
          durationSeconds: 420,
          title: { 'pt-BR': 'Comunicação assíncrona' },
          content: { 'pt-BR': 'Quando escrever, quando ligar e como documentar decisões.' },
        }),
        textLesson({
          id: 'les-time-1-2',
          durationSeconds: 360,
          title: { 'pt-BR': 'Acordo de disponibilidade' },
          content: {
            'pt-BR':
              '## Janelas de sobreposição\n\nDefina em quais horários todos estarão disponíveis e proteja o restante para trabalho focado.',
          },
        }),
      ]),
      courseModule('mod-time-2', id, 1, { 'pt-BR': 'Rotina de foco' }, [
        textLesson({
          id: 'les-time-2-1',
          durationSeconds: 480,
          title: { 'pt-BR': 'Blocos de foco semanais' },
          content: {
            'pt-BR':
              '## Planejamento\n\nReserve blocos de duas horas sem reuniões para as tarefas mais importantes da semana.',
          },
        }),
        quizLesson({
          id: 'les-time-2-2',
          durationSeconds: 180,
          passingScore: 50,
          title: { 'pt-BR': 'Quiz: rotina de foco' },
          content: { 'pt-BR': 'Verifique os principais conceitos do módulo.' },
          questions: [
            question(
              'q-time-1',
              {
                'pt-BR': {
                  prompt: 'Qual o objetivo de um bloco de foco?',
                  explanation:
                    'Blocos sem interrupções protegem o trabalho que exige concentração.',
                },
              },
              [
                {
                  id: 'q-time-1-a',
                  correct: true,
                  text: { 'pt-BR': 'Proteger tempo para trabalho profundo' },
                },
                { id: 'q-time-1-b', text: { 'pt-BR': 'Marcar mais reuniões' } },
              ],
            ),
          ],
        }),
      ]),
    ],
  };
}
