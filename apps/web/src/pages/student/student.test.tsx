import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { ServiceError } from '@/services';
import { renderApp } from '@/test/render';
import { demoId } from '@/services/mock/seed/ids';

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  // jsdom has no media pipeline
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

describe('authentication', () => {
  it('signs in with the demo student button and lands on the home screen', async () => {
    const user = userEvent.setup();
    await renderApp('/login');

    await user.click(screen.getByRole('button', { name: 'Entrar como aluno' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Olá, Lucas' })).toBeVisible();
  });

  it('validates the login form inline before calling the service', async () => {
    const user = userEvent.setup();
    await renderApp('/login');

    await user.click(screen.getAllByRole('button', { name: 'Entrar' })[0]!);

    expect(await screen.findByText('Informe um e-mail válido.')).toBeVisible();
    expect(screen.getByText('Preencha este campo.')).toBeVisible();
  });

  it('shows an error state for an invalid invite and the form for a valid one', async () => {
    await renderApp('/invite/token-inexistente');
    expect(await screen.findByText('Convite indisponível')).toBeVisible();
  });

  it('shows the invited e-mail and course on a valid invite', async () => {
    await renderApp('/invite/demo-convite-sql');
    expect(await screen.findByDisplayValue('novo.aluno@opencourse.example')).toBeVisible();
    expect(screen.getByText(/Introdução à Análise de Dados com SQL/)).toBeVisible();
  });

  it('still offers the invite when the course cannot be read, as for guests on the real API', async () => {
    await renderApp('/invite/demo-convite-sql', {
      mock: { failOn: (operation) => operation === 'courses.getById' },
    });
    expect(await screen.findByDisplayValue('novo.aluno@opencourse.example')).toBeVisible();
    expect(screen.getByText(/convidado para um curso/i)).toBeVisible();
    expect(screen.queryByText(/Introdução à Análise de Dados com SQL/)).not.toBeInTheDocument();
  });

  it('asks for a new link when the reset token is missing', async () => {
    await renderApp('/reset-password');
    expect(await screen.findByText('Link inválido')).toBeVisible();
  });

  it('verifies a certificate by its code without signing in', async () => {
    await renderApp('/verify/OC-7K2M-9QXA');
    expect(await screen.findByText('Este certificado é autêntico.')).toBeVisible();
  });

  it('explains that an unknown certificate code was not found', async () => {
    await renderApp('/verify/OC-0000-0000');
    expect(await screen.findByText('Certificado não encontrado')).toBeVisible();
  });
});

describe('student home', () => {
  it('shows continue learning, my courses and recent certificates', async () => {
    await renderApp('/', { signInAs: 'student' });

    expect(await screen.findByText('Continuar de onde parou')).toBeVisible();
    expect(await screen.findByRole('link', { name: /Continuar aula/ })).toBeVisible();
    expect(
      await screen.findByRole('heading', { name: 'Fundamentos de JavaScript Moderno' }),
    ).toBeVisible();
    expect(
      (await screen.findAllByText('Introdução à Análise de Dados com SQL')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Certificados recentes')).toBeVisible();
  });

  it('shows an error state with retry when loading courses fails', async () => {
    let shouldFail = true;
    await renderApp('/', {
      signInAs: 'student',
      mock: { failOn: (operation) => shouldFail && operation === 'enrollments.listMyCourses' },
    });
    const user = userEvent.setup();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);

    shouldFail = false;
    await user.click(screen.getAllByRole('button', { name: 'Tentar novamente' })[0]!);
    expect(
      await screen.findByRole('heading', { name: 'Fundamentos de JavaScript Moderno' }),
    ).toBeVisible();
  });

  it('shows the empty state for a student without grants', async () => {
    await renderApp('/', { email: 'nova.pessoa@opencourse.example' });

    expect(await screen.findByText('Você ainda não tem cursos')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Verificar novamente' })).toBeVisible();
  });

  it('filters my courses by the search query and offers to clear it', async () => {
    const user = userEvent.setup();
    await renderApp('/?q=zzz', { signInAs: 'student' });

    expect(await screen.findByText('Nenhum curso encontrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(
      await screen.findByRole('heading', { name: 'Fundamentos de JavaScript Moderno' }),
    ).toBeVisible();
  });
});

describe('course page', () => {
  it("shows the instructor's name from the course when students cannot read users", async () => {
    // the real API closes GET /users/:id to students and sends the name with the course
    const lookup = vi.fn(() => Promise.reject(new ServiceError('forbidden', 'closed to students')));
    await renderApp('/courses/fundamentos-de-javascript', {
      signInAs: 'student',
      override: (services) => ({
        courses: {
          ...services.courses,
          getBySlug: async (slug) => ({
            ...(await services.courses.getBySlug(slug)),
            instructor: { id: demoId('user-rafael'), name: 'Prof. Real' },
          }),
        },
        users: { ...services.users, getById: lookup },
      }),
    });
    expect(await screen.findByText('Prof. Real')).toBeVisible();
    // no request that would only be refused
    expect(lookup).not.toHaveBeenCalled();
  });

  it('lists modules, lessons with type and status, and the learning outcomes', async () => {
    await renderApp('/courses/fundamentos-de-javascript', { signInAs: 'student' });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fundamentos de JavaScript Moderno' }),
    ).toBeVisible();
    expect(
      screen.getByText('Declarar variáveis e escolher o tipo certo para cada dado'),
    ).toBeVisible();
    // the module with the next pending lesson starts open; open the first one too
    await userEvent.click(screen.getByRole('button', { name: /Primeiros passos/ }));
    expect(screen.getByRole('link', { name: /Boas-vindas e como estudar/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Continuar curso/ })).toBeVisible();
  });

  it('locks lessons of sequential courses until the previous ones are completed', async () => {
    await renderApp('/courses/design-de-interfaces-na-pratica', { signInAs: 'student' });

    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    // open every module so locked lessons are rendered
    const main = within(screen.getByRole('main'));
    for (const trigger of main.getAllByRole('button', { expanded: false })) {
      await userEvent.click(trigger);
    }
    expect(screen.getAllByLabelText('Bloqueada').length).toBeGreaterThan(0);
  });

  it('explains the missing access, without any purchase wording', async () => {
    await renderApp('/courses/fundamentos-de-javascript', {
      email: 'nova.pessoa@opencourse.example',
    });

    expect(await screen.findByText('Você ainda não tem acesso a este curso')).toBeVisible();
    expect(document.body.textContent).not.toMatch(/preço|comprar|pagamento|checkout/i);
    expect(screen.queryByRole('link', { name: /Começar curso/ })).not.toBeInTheDocument();
  });

  it('shows the not found state for an unknown course', async () => {
    await renderApp('/courses/nao-existe', { signInAs: 'student' });
    expect(await screen.findByText('Curso não encontrado')).toBeVisible();
  });
});

describe('lesson player', () => {
  it('renders a text lesson as Markdown and completes it', async () => {
    const user = userEvent.setup();
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-2')}`, {
      signInAs: 'student',
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'Variáveis' })).toBeVisible();
    expect(screen.getByText('const nome = "Ana";', { exact: false })).toBeInTheDocument();

    // already completed in the seed: undo, then complete again
    const toggle = await screen.findByRole('button', { name: /Concluída \(desmarcar\)/ });
    await user.click(toggle);
    expect(await screen.findByRole('button', { name: 'Marcar como concluída' })).toBeVisible();
  });

  it('lists downloads for a file lesson', async () => {
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-3')}`, {
      signInAs: 'student',
    });

    expect(await screen.findByText('exercicios-modulo-1.pdf')).toBeVisible();
    const link = screen.getByRole('link', { name: 'Baixar exercicios-modulo-1.pdf' });
    expect(link).toHaveAttribute('href', '/media/files/exercicios-modulo-1.pdf');
  });

  it('renders the video player with its captions and translated controls', async () => {
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-1')}`, {
      signInAs: 'student',
    });

    const player = await screen.findByRole('group', { name: /Player de vídeo/ });
    // the demo video plays through the same player as an uploaded one, minus the HLS engine
    const video = player.querySelector('video');
    expect(video).toHaveAttribute('src', '/media/sample-lesson.mp4');
    expect(video?.querySelector('track[kind="captions"][srclang="pt-BR"]')).not.toBeNull();
    // the player's own labels follow the app language
    expect(within(player).getByRole('button', { name: /Reproduzir/ })).toBeInTheDocument();
  });

  it('grades a quiz with per-question feedback and keeps the attempt history', async () => {
    const user = userEvent.setup();
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-4')}`, {
      signInAs: 'student',
    });

    await screen.findByRole('heading', { level: 1, name: 'Quiz: tipos e variáveis' });
    const submit = screen.getByRole('button', { name: 'Enviar respostas' });
    expect(submit).toBeDisabled();

    // wrong answer on every question
    for (const group of screen.getAllByRole('group')) {
      await user.click(within(group).getAllByRole('radio')[2]!);
    }
    await user.click(submit);

    expect(await screen.findByText('Ainda não foi desta vez')).toBeVisible();
    // a failed attempt marks the wrong picks but does not hand out the right options
    expect(screen.getAllByText('Sua resposta').length).toBe(3);
    expect(screen.queryByText('Resposta correta')).not.toBeInTheDocument();
    // the explanation of each question comes with the feedback
    expect(screen.getAllByText(/Explicação:/).length).toBe(3);
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });

  it('marks the right pick of a failed attempt without revealing the other answers', async () => {
    const user = userEvent.setup();
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-4')}`, {
      signInAs: 'student',
    });

    await screen.findByRole('heading', { level: 1, name: 'Quiz: tipos e variáveis' });
    const [first, second, third] = screen.getAllByRole('group');
    const pick = async (group: HTMLElement, optionKey: string) => {
      const radio = within(group)
        .getAllByRole('radio')
        .find((candidate) => (candidate as HTMLInputElement).value === demoId(optionKey));
      await user.click(radio!);
    };
    await pick(first!, 'q-js-1-a');
    await pick(second!, 'q-js-2-a');
    await pick(third!, 'q-js-3-a');
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    expect(await screen.findByText('Ainda não foi desta vez')).toBeVisible();
    expect(screen.getAllByText('Resposta correta').length).toBe(1);
    expect(screen.getAllByText('Sua resposta').length).toBe(2);
  });

  it('reveals the right options once the quiz is passed', async () => {
    const user = userEvent.setup();
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-4')}`, {
      signInAs: 'student',
    });

    await screen.findByRole('heading', { level: 1, name: 'Quiz: tipos e variáveis' });
    const groups = screen.getAllByRole('group');
    const rightOptions = ['q-js-1-a', 'q-js-2-b', 'q-js-3-b'].map((key) => demoId(key));
    for (const [index, group] of groups.entries()) {
      const radio = within(group)
        .getAllByRole('radio')
        .find((candidate) => (candidate as HTMLInputElement).value === rightOptions[index]);
      await user.click(radio!);
    }
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    expect(await screen.findByText('Aprovado!')).toBeVisible();
    expect(screen.getAllByText('Resposta correta').length).toBe(3);
  });

  it('blocks locked lessons reached by URL in sequential courses', async () => {
    await renderApp(
      `/courses/design-de-interfaces-na-pratica/lessons/${demoId('les-design-2-1')}`,
      {
        signInAs: 'student',
      },
    );
    expect(await screen.findByText('Aula bloqueada')).toBeVisible();
  });

  it('saves personal notes', async () => {
    const user = userEvent.setup();
    await renderApp(`/courses/fundamentos-de-javascript/lessons/${demoId('les-js-1-2')}`, {
      signInAs: 'student',
    });

    await user.click(await screen.findByRole('tab', { name: 'Notas' }));
    const field = await screen.findByLabelText('Suas notas sobre esta aula');
    await user.type(field, 'Lembrar de usar const');
    await user.click(screen.getByRole('button', { name: 'Salvar nota' }));

    await waitFor(() => expect(screen.getByText(/Salva em/)).toBeVisible());
  });
});

describe('certificates', () => {
  it('lists certificates with preview and download actions', async () => {
    await renderApp('/certificates', { signInAs: 'student' });

    expect(await screen.findByText('OC-7K2M-9QXA', { exact: false })).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Baixar certificado de Introdução à Análise de Dados com SQL em PDF',
      }),
    ).toBeVisible();
  });

  it('shows the empty state when the student has no certificates', async () => {
    await renderApp('/certificates', { signInAs: 'instructor' });
    expect(await screen.findByText('Nenhum certificado ainda')).toBeVisible();
  });
});

describe('settings', () => {
  it('updates the profile and switches the interface language', async () => {
    const user = userEvent.setup();
    await renderApp('/settings', { signInAs: 'student' });

    const name = await screen.findByLabelText('Nome');
    await user.clear(name);
    await user.type(name, 'Lucas F. Silva');
    await user.selectOptions(within(screen.getByRole('main')).getByLabelText('Idioma'), 'en');
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  });

  it('validates the new password confirmation', async () => {
    const user = userEvent.setup();
    await renderApp('/settings', { signInAs: 'student' });

    await user.type(await screen.findByLabelText('Senha atual'), 'atual-123');
    await user.type(screen.getByLabelText('Nova senha'), 'nova-senha-1');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'diferente-1');
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('As senhas não coincidem.')).toBeVisible();
  });
});
