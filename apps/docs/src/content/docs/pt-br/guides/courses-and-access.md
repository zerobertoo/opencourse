---
title: Cursos e acesso
description: Quem vê o quê, publicação e concessões.
---

As rotas de curso ficam em `/api/v1` e estão documentadas na referência OpenAPI em `/docs` da API (tags `courses`, `curriculum` e `grants`).

## Quem vê o quê

- Usuários logados listam os cursos publicados, mais os arquivados para os quais ainda têm uma concessão.
- Rascunhos respondem 404 a quem não pode editá-los, então a existência deles não vaza.
- O currículo (aulas, conteúdo, vídeo, quiz) exige uma concessão ativa, ou ser o instrutor do curso ou admin. Sem isso o curso responde 403.
- As respostas dos quizzes são removidas de toda resposta para quem não pode gerenciar o curso.

## Publicação

Um curso só vai ao ar quando `getPublishIssues` (em `packages/shared`) não aponta nada, e um curso publicado não pode ser editado para um problema novo. Os links de vídeo e de imagem de capa precisam ser `https`.

## Concessões

O acesso a um curso é sempre uma concessão (grant). Instrutores (nos próprios cursos) e admins criam, listam, revogam e estendem concessões.

- Um usuário tem no máximo uma concessão aberta por curso. Conceder de novo estende a existente em vez de empilhar, e revogar duas vezes é inofensivo.
- Aceitar um convite que cita um curso cria a concessão na mesma transação que a conta.
- Revogar uma concessão, ou deixá-la expirar, esconde o curso e o progresso. Nada é apagado, e conceder de novo traz tudo de volta.

## Auditoria

As mudanças de status do curso e a criação, extensão e revogação de concessões são gravadas no log de auditoria.
