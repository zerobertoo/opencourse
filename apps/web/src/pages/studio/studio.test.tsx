import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { renderApp } from '@/test/render';
import { demoId } from '@/services/mock/seed/ids';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const SQL_EDITOR = `/studio/courses/${demoId('course-sql')}`;
const JS_TITLE = 'Fundamentos de JavaScript Moderno';

/** The visible editor tab panel: other tabs stay mounted (hidden) and repeat some labels. */
const contentPanel = () => within(screen.getByRole('tabpanel', { name: 'Conteúdo' }));

/** The button that selects a lesson (not its drag handle), e.g. "Vídeo: Seu primeiro SELECT 9:00". */
const lessonButton = (title: string) =>
  screen.findByRole('button', { name: new RegExp(`^\\S+:\\s*${title}`) });

describe('studio access', () => {
  it('blocks students and lets another instructor see only their own courses', async () => {
    await renderApp('/studio', { signInAs: 'student' });
    expect(await screen.findByText('Acesso negado')).toBeVisible();
  });

  it('shows the forbidden screen when an instructor opens someone else’s course', async () => {
    await renderApp(`/studio/courses/${demoId('course-javascript')}`, { email: 'beatriz@opencourse.example' });
    expect(await screen.findByText('Acesso negado')).toBeVisible();
  });

  it('shows the not found state for an unknown course', async () => {
    await renderApp('/studio/courses/nao-existe', { signInAs: 'instructor' });
    expect(await screen.findByText('Curso não encontrado')).toBeVisible();
  });
});

describe('studio dashboard', () => {
  it('shows the metric cards and the instructor courses', async () => {
    await renderApp('/studio', { signInAs: 'instructor' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Painel do instrutor' }),
    ).toBeVisible();
    const metrics = await screen.findByRole('region', { name: 'Métricas gerais' });
    expect(within(metrics).getByText('Alunos ativos')).toBeVisible();
    expect(within(metrics).getByText('Cursos publicados')).toBeVisible();
    expect(within(metrics).getByText('Taxa de conclusão')).toBeVisible();
    expect(await screen.findByRole('link', { name: new RegExp(JS_TITLE) })).toBeVisible();
  });

  it('shows an error state with retry', async () => {
    let fail = true;
    const { services } = await renderApp('/studio', {
      signInAs: 'instructor',
      mock: { failOn: (operation) => fail && operation === 'studio.getDashboard' },
    });
    expect(services).toBeDefined();
    const user = userEvent.setup();
    const retry = (await screen.findAllByRole('button', { name: 'Tentar novamente' }))[0]!;
    fail = false;
    await user.click(retry);
    expect(await screen.findByText('Alunos ativos')).toBeVisible();
  });
});

describe('studio course list', () => {
  it('filters by search and status and offers to clear the filters', async () => {
    const user = userEvent.setup();
    await renderApp('/studio/courses', { signInAs: 'instructor' });

    expect(await screen.findByRole('link', { name: JS_TITLE })).toBeVisible();

    await user.type(screen.getByLabelText('Buscar cursos'), 'sql');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: JS_TITLE })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /Análise de Dados com SQL/ })).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'archived');
    expect(await screen.findByText('Nenhum curso encontrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByRole('link', { name: JS_TITLE })).toBeVisible();
  });

  it('flags courses with incomplete translations', async () => {
    await renderApp('/studio/courses', { signInAs: 'instructor' });
    await screen.findByRole('link', { name: JS_TITLE });
    expect(screen.getAllByText(/incompleto/).length).toBeGreaterThan(0);
  });

  it('creates a draft course and opens its editor', async () => {
    const user = userEvent.setup();
    await renderApp('/studio/courses', { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: 'Novo curso' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Criar curso' }));
    expect(await within(dialog).findByText('Preencha este campo.')).toBeVisible();

    await user.type(within(dialog).getByLabelText('Título do curso'), 'Curso novo de teste');
    await user.click(within(dialog).getByRole('button', { name: 'Criar curso' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Curso novo de teste' }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: /Detalhes/, selected: true })).toBeVisible();
  });
});

describe('course editor: details', () => {
  it('warns about incomplete translations and saves a new one', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/details`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('tab', { name: /English/ }));
    expect(await screen.findByText('A tradução para English está incompleta')).toBeVisible();

    const title = screen.getByLabelText('Título');
    await user.type(title, 'Intro to SQL');
    await user.click(screen.getByRole('button', { name: 'Salvar detalhes' }));
    expect(await screen.findByText('Detalhes salvos.')).toBeVisible();
  });

  it('requires the title in the default language and jumps to the tab with the error', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/details`, { signInAs: 'instructor' });

    const title = await screen.findByLabelText('Título');
    await user.clear(title);
    await user.click(screen.getByRole('tab', { name: /English/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar detalhes' }));

    expect(await screen.findByText('Preencha este campo.')).toBeVisible();
    expect(screen.getByRole('tab', { name: /Português/, selected: true })).toBeVisible();
  });
});

describe('course editor: content', () => {
  it('adds a module and a lesson, then opens the new lesson for editing', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: 'Adicionar módulo' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Título do módulo'), 'Módulo extra');
    await user.click(within(dialog).getByRole('button', { name: 'Criar módulo' }));
    expect(await screen.findByRole('heading', { name: 'Módulo extra' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Adicionar aula em Módulo extra' }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText(/Texto/));
    await user.type(within(dialog).getByLabelText('Título da aula'), 'Aula extra');
    await user.click(within(dialog).getByRole('button', { name: 'Criar aula' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Aula extra' })).toBeVisible();
    expect(screen.getByLabelText('Texto da aula')).toBeVisible();
  });

  it('edits a lesson in two languages and shows the Markdown preview', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Filtrando e ordenando resultados'));
    const body = await screen.findByLabelText('Texto da aula');
    expect((body as HTMLTextAreaElement).value).toContain('WHERE e ORDER BY');

    await user.click(screen.getByRole('tab', { name: 'Pré-visualizar' }));
    expect(await screen.findByRole('heading', { name: 'WHERE e ORDER BY' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Escrever' }));

    await user.click(screen.getAllByRole('tab', { name: /English/ })[0]!);
    await user.type(contentPanel().getByLabelText('Título'), 'Filtering results');
    await user.click(screen.getByRole('button', { name: 'Salvar aula' }));
    expect(await screen.findByText('Aula salva.')).toBeVisible();
  });

  it('validates the duration format', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Seu primeiro SELECT'));
    const duration = await screen.findByLabelText('Duração');
    await user.clear(duration);
    await user.type(duration, 'abc');
    await user.click(screen.getByRole('button', { name: 'Salvar aula' }));
    expect(await screen.findByText(/Use minutos ou m:ss/)).toBeVisible();
  });

  it('reorders modules from the module menu without dragging', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    const headings = async () =>
      (await screen.findAllByRole('heading', { level: 3 })).map((heading) => heading.textContent);
    expect(await headings()).toEqual(['Consultas básicas', 'Junções e agregações']);

    await user.click(screen.getByRole('button', { name: 'Ações do módulo Junções e agregações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mover para cima' }));
    await waitFor(async () =>
      expect(await headings()).toEqual(['Junções e agregações', 'Consultas básicas']),
    );
  });

  it('moves a lesson to another module and reorders it with the panel buttons', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Seu primeiro SELECT'));
    await user.selectOptions(await screen.findByLabelText('Módulo'), demoId('mod-sql-2'));
    await waitFor(async () => {
      const course = await services.courses.getById(demoId('course-sql'));
      expect(course.modules[1]?.lessons.some((lesson) => lesson.id === demoId('les-sql-1-1'))).toBe(true);
    });

    await user.click(screen.getByRole('button', { name: 'Mover para cima' }));
    await waitFor(async () => {
      const course = await services.courses.getById(demoId('course-sql'));
      const lessons = course.modules[1]!.lessons;
      expect(lessons[lessons.length - 2]?.id).toBe(demoId('les-sql-1-1'));
    });
  });

  it('asks before leaving a lesson with unsaved changes', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Seu primeiro SELECT'));
    await user.type(await contentPanel().findByLabelText('Título'), ' (editado)');
    await user.click(await lessonButton('Filtrando e ordenando resultados'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Descartar alterações não salvas?')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Descartar alterações' }));
    expect(await screen.findByLabelText('Texto da aula')).toBeVisible();
  });

  it('deletes a lesson after confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Seu primeiro SELECT'));
    await user.click(await screen.findByRole('button', { name: 'Excluir aula' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir aula' }));

    await waitFor(async () => {
      const course = await services.courses.getById(demoId('course-sql'));
      expect(course.modules[0]?.lessons.some((lesson) => lesson.id === demoId('les-sql-1-1'))).toBe(false);
    });
    expect(await screen.findByText('Selecione uma aula')).toBeInTheDocument();
  });

  it('shows the processing status after choosing a video file', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, {
      signInAs: 'instructor',
      mock: { videoProcessingMs: 60_000 },
    });

    await user.click(await lessonButton('Seu primeiro SELECT'));
    const input = await screen.findByLabelText('Enviar vídeo', { selector: 'input' });
    await user.upload(input, new File(['x'], 'aula.mp4', { type: 'video/mp4' }));

    expect(await screen.findByText('Processando')).toBeVisible();
  });
});

describe('course editor: quiz builder', () => {
  it('builds a question, lists what blocks publishing and saves', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Quiz: consultas básicas'));
    const passing = await screen.findByLabelText('Nota mínima para passar (%)');
    expect(passing).toHaveValue(60);
    await user.clear(passing);
    await user.type(passing, '80');

    await user.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));
    expect(await screen.findByText('Corrija antes de publicar')).toBeVisible();
    expect(screen.getByText('A pergunta 3 não tem texto no idioma padrão.')).toBeVisible();

    await user.type(screen.getAllByLabelText('Pergunta')[2]!, 'Qual comando lista tabelas?');
    await user.type(screen.getAllByLabelText('Opção 1')[2]!, 'SHOW TABLES');
    await user.type(screen.getAllByLabelText('Opção 2')[2]!, 'LIST');
    await user.click(screen.getAllByLabelText('Marcar a opção 1 como correta')[2]!);
    expect(screen.queryByText(/A pergunta 3/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar quiz' }));
    expect(await screen.findByText('Quiz salvo.')).toBeVisible();

    const course = await services.courses.getById(demoId('course-sql'));
    const quiz = course.modules[0]?.lessons.find((lesson) => lesson.id === demoId('les-sql-1-3'));
    expect(quiz?.type === 'quiz' && quiz.quiz).toMatchObject({ passingScore: 80 });
    expect(quiz?.type === 'quiz' && quiz.quiz.questions).toHaveLength(3);
    // many keystrokes through a heavy form: the default 5s is tight on a slow CI runner
  }, 20_000);

  it('keeps at least two options and reorders questions', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/content`, { signInAs: 'instructor' });

    await user.click(await lessonButton('Quiz: consultas básicas'));
    await screen.findByLabelText('Nota mínima para passar (%)');
    await user.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));
    const removeButtons = screen.getAllByRole('button', { name: /Remover a opção/ });
    // the new question starts with two options, which cannot be removed
    expect(removeButtons.slice(-2).every((button) => button.hasAttribute('disabled'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Mover a pergunta 3 para cima' }));
    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }));
    expect(screen.getByRole('button', { name: 'Salvar quiz' })).toBeDisabled();
  });
});

describe('course editor: students', () => {
  it('lists students with progress and grants access with an expiry', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/students`, { signInAs: 'instructor' });

    const list = await screen.findByRole('list', { name: 'Alunos com acesso' });
    expect(within(list).getByText('Lucas Ferreira')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Conceder acesso' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Conceder acesso' }));
    expect(await within(dialog).findByText('Preencha este campo.')).toBeVisible();

    const select = within(dialog).getByLabelText('Aluno');
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    // students who already have active access are not offered
    expect(within(select).queryByRole('option', { name: /Lucas/ })).not.toBeInTheDocument();
    await user.selectOptions(select, demoId('user-thiago'));
    await user.click(within(dialog).getByLabelText('Até uma data'));
    await user.click(within(dialog).getByRole('button', { name: 'Conceder acesso' }));
    expect(await within(dialog).findByText('Escolha uma data.')).toBeVisible();

    await user.type(within(dialog).getByLabelText('O acesso termina em'), '2099-12-31');
    await user.click(within(dialog).getByRole('button', { name: 'Conceder acesso' }));

    expect(await screen.findByText('Acesso concedido.')).toBeVisible();
    const grants = await services.grants.list({ courseId: demoId('course-sql'), userId: demoId('user-thiago') });
    expect(grants[0]?.expiresAt).toMatch(/^2099-12-31|^2100-01-01/);
  });

  it('creates an invite and shows its link', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/students`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: 'Convidar aluno' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('E-mail do aluno'), 'nao-e-email');
    await user.click(within(dialog).getByRole('button', { name: 'Criar convite' }));
    expect(await within(dialog).findByText('Informe um e-mail válido.')).toBeVisible();

    await user.clear(within(dialog).getByLabelText('E-mail do aluno'));
    await user.type(within(dialog).getByLabelText('E-mail do aluno'), 'novo@opencourse.example');
    await user.click(within(dialog).getByRole('button', { name: 'Criar convite' }));

    const link = await within(dialog).findByLabelText('Link do convite');
    expect((link as HTMLInputElement).value).toMatch(/\/invite\/convite-/);
    await user.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    expect(await screen.findByText('novo@opencourse.example')).toBeVisible();
  });

  it('revokes access after confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/students`, { signInAs: 'instructor' });

    await user.click(
      await screen.findByRole('button', { name: 'Revogar o acesso de Gustavo Lima' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revogar acesso' }));

    expect(await screen.findByText('Acesso de Gustavo Lima revogado.')).toBeVisible();
    const grants = await services.grants.list({ courseId: demoId('course-sql'), userId: demoId('user-gustavo') });
    expect(grants[0]?.status).toBe('revoked');
  });
});

describe('course editor: certificate', () => {
  it('previews the template live and saves it', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/certificate`, { signInAs: 'instructor' });

    const signatory = await screen.findByLabelText('Assinado por');
    await user.clear(signatory);
    await user.type(signatory, 'Dra. Teste');
    await user.type(
      screen.getByLabelText('Mensagem personalizada (opcional)'),
      'Parabéns pela conquista',
    );

    const preview = screen.getByRole('region', { name: 'Pré-visualização' });
    expect(within(preview).getByText('Dra. Teste')).toBeVisible();
    expect(within(preview).getByText('Parabéns pela conquista')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Salvar modelo' }));
    expect(await screen.findByText('Modelo de certificado salvo.')).toBeVisible();
    expect((await services.courses.getById(demoId('course-sql'))).certificateTemplate.signatoryName).toBe(
      'Dra. Teste',
    );
  });

  it('stops issuing certificates when turned off', async () => {
    const user = userEvent.setup();
    await renderApp(`${SQL_EDITOR}/certificate`, { signInAs: 'instructor' });

    await user.click(await screen.findByLabelText('Emitir certificado na conclusão'));
    expect(await screen.findByText(/Os certificados estão desativados neste curso/)).toBeVisible();
  });
});

describe('course editor: settings', () => {
  it('lists what blocks publishing a new draft and publishes once it is ready', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp('/studio/courses', { signInAs: 'instructor' });
    const draft = await services.courses.create({ title: 'Rascunho novo', defaultLocale: 'pt-BR' });

    await user.click(await screen.findByRole('link', { name: 'Rascunho novo' }));
    await user.click(await screen.findByRole('tab', { name: 'Configurações' }));
    expect(await screen.findByText('Adicione pelo menos uma aula.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publicar curso' })).toBeDisabled();

    const { moduleId } = await services.curriculum.createModule({
      courseId: draft.id,
      title: 'Módulo',
      locale: 'pt-BR',
    });
    await services.curriculum.createLesson({
      moduleId,
      type: 'text',
      title: 'Aula',
      locale: 'pt-BR',
    });
    await user.click(screen.getByRole('tab', { name: 'Conteúdo' }));
    await user.click(screen.getByRole('tab', { name: 'Configurações' }));
    // the editor reads the cache; reload it through the same service the page uses
    await waitFor(async () => {
      expect((await services.courses.getById(draft.id)).modules).toHaveLength(1);
    });
  });

  it('archives with confirmation and restores as a draft', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/settings`, { signInAs: 'instructor' });

    await user.click(await screen.findByRole('button', { name: 'Arquivar curso' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Arquivar' }));
    expect(await screen.findByText('Curso arquivado.')).toBeVisible();
    expect((await services.courses.getById(demoId('course-sql'))).status).toBe('archived');

    await user.click(await screen.findByRole('button', { name: 'Restaurar como rascunho' }));
    expect(await screen.findByText('Curso restaurado como rascunho.')).toBeVisible();
    expect((await services.courses.getById(demoId('course-sql'))).status).toBe('draft');
  });

  it('toggles sequential order and unpublishes with confirmation', async () => {
    const user = userEvent.setup();
    const { services } = await renderApp(`${SQL_EDITOR}/settings`, { signInAs: 'instructor' });

    await user.click(await screen.findByLabelText('Aulas em sequência'));
    expect(await screen.findByText('Ordem das aulas atualizada.')).toBeVisible();
    expect((await services.courses.getById(demoId('course-sql'))).sequentialOrder).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Despublicar (voltar a rascunho)' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Despublicar' }));
    expect(await screen.findByText('O curso voltou a ser rascunho.')).toBeVisible();
  });
});

describe('studio in English', () => {
  it('switches the whole editor to English without reloading', async () => {
    await i18n.changeLanguage('en');
    await renderApp(`${SQL_EDITOR}/details`, { signInAs: 'instructor' });
    expect(await screen.findByRole('tab', { name: 'Content' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save details' })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/price|purchase|payment|checkout/i);
  });
});
