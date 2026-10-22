# Arquivos da aula: legendas e anexos

Instrutores podem anexar arquivos para download em qualquer aula e adicionar legendas às aulas de vídeo.
Ambos ficam no mesmo bucket compatível com S3 dos vídeos enviados (veja [video.md](video.md)),
e ambos são entregues apenas a quem pode ver o conteúdo do curso.

## Anexos

- No Studio, abra uma aula e use **Materiais**. Uma aula de arquivo é feita dos seus anexos.
- O navegador envia cada arquivo direto ao armazenamento com um `PUT` pré-assinado e depois pede
  à API que o confirme. A API confere se o tamanho guardado é o que foi anunciado.
- Qualquer tipo de arquivo é aceito, até `ATTACHMENT_MAX_BYTES` (padrão `52428800`, 50 MiB).
- Os downloads passam por `GET /api/v1/attachments/:id/download`. A API confere o acesso ao curso
  e responde `{ "url": ... }` com um endereço de curta duração que faz o navegador **salvar** o arquivo
  (`Content-Disposition: attachment`), então um HTML ou SVG enviado nunca executa no seu site.
  O app web pede esse endereço quando o botão é clicado, o que permite renovar antes uma sessão
  expirada.
- O endereço de envio é assinado com o tamanho anunciado, então o armazenamento recusa um corpo de
  qualquer outro tamanho. Envios que nunca são confirmados são descartados após 24 horas.

## Legendas

- No Studio, abra uma aula de vídeo e use **Legendas**: um arquivo por idioma.
- Envie **WebVTT** (`.vtt`) ou **SRT** (`.srt`). O SRT é convertido para WebVTT ao ser guardado, sempre em UTF-8. O arquivo pode estar em UTF-8, UTF-16 (com marca de ordem de bytes) ou Latin-1/Windows-1252: a codificação é detectada, então os acentos sobrevivem.
  Qualquer outra coisa é recusada. Os arquivos são limitados a 1 MiB.
- O player as carrega por `GET /api/v1/lessons/:id/captions/:locale.vtt`, que confere o
  acesso ao curso.
- As legendas ainda podem ser coladas como um link `https` por `PATCH /lessons/:id`.

## Limpeza

Excluir uma aula ou um módulo também exclui seus anexos e legendas do armazenamento.

## Configuração

| Variável               | Padrão     | Significado                                      |
| ---------------------- | ---------- | ------------------------------------------------ |
| `ATTACHMENT_MAX_BYTES` | `52428800` | Maior anexo que um instrutor pode enviar.        |

O navegador precisa da mesma regra de CORS do armazenamento descrita em [video.md](video.md): os anexos
são enviados com `PUT` direto para `S3_PUBLIC_URL`.
