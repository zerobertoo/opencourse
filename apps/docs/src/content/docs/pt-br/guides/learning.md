---
title: Estudo e certificados
description: Progresso, quizzes, notas e certificados.
---

Tags `progress`, `me`, `studio` e `certificates` na referência OpenAPI.

## Progresso

`PUT /lessons/:id/progress` marca uma aula como concluída (ou não) e guarda a posição do vídeo. `GET /courses/:id/progress` lista os registros de quem chama. Só quem pode ler o curso pode gravar.

- Em cursos com ordem sequencial o servidor recusa concluir, guardar posição ou fazer quiz em uma aula bloqueada.
- Aulas de vídeo só são concluídas quando o cliente pede (o player decide quando, por exemplo em cerca de 90%). Players embutidos de um provedor não informam a posição, então os alunos marcam essas aulas por conta própria.
- Aulas de quiz só são concluídas ao passar.

## Quizzes

`POST /quizzes/:lessonId/attempts` corrige no servidor.

- O aluno nunca recebe `isCorrect`, só o retorno por pergunta depois de enviar. A opção certa só é revelada quando a tentativa passa.
- As tentativas são ilimitadas e todas ficam guardadas. A nota de corte é a do próprio quiz, e passar conclui a aula para sempre.

## Matrículas e painel

`GET /me/courses` lista as concessões ativas (cursos arquivados incluídos) com um resumo do progresso, e `GET /me/continue-learning` aponta a próxima aula com a posição do vídeo guardada. Quem gerencia tem `GET /courses/:id/students` e `GET /studio/metrics` (alunos ativos, taxa de conclusão).

## Notas

`GET` e `PUT /lessons/:id/note`. As notas são privadas de quem as escreve, e um texto em branco apaga a nota.

## Certificados

Concluir um curso, com o modelo de certificado do curso habilitado, emite um certificado por aluno e curso, para sempre.

- O nome do titular, os títulos do curso e o modelo são copiados para a linha, então edições posteriores nunca alteram um certificado verificável.
- Eventos `course.completed` repetidos são inofensivos (`UNIQUE (user_id, course_id)` e `ON CONFLICT DO NOTHING`), e só o insert que vence grava `certificate.issued`.
- O worker emite logo depois da conclusão do curso (até cerca de um segundo depois) e envia o e-mail ao aluno, com novas tentativas. `email_sent_at` é preenchido quando o e-mail saiu. Uma queda entre o envio e o registro pode enviar duas vezes.
- `GET /me/certificates` lista os de quem chama. `GET /certificates/verify/:code` é público, tem limite de requisições, responde o mesmo 404 para códigos malformados e desconhecidos e não expõe e-mail nem ids. Os códigos têm o formato `OC-XXXX-XXXX`.
- O PDF é gerado pelo cliente web a partir dos dados guardados. Nomes fora do Latin-1 saem com `?`.
- Quem terminou antes de existir o outbox recebe o seu com `pnpm --filter @opencourse/api certificates:backfill` (idempotente, não envia e-mail).
- Ainda não há revogação nem reemissão.
