# Vídeo

Uma aula em vídeo contém **um arquivo enviado para a sua instância**, que o worker converte para HLS adaptativo, ou **um link de um provedor externo** (YouTube, Vimeo, Bunny Stream, Cloudflare Stream, Panda Video, Google Drive), reproduzido no player do próprio provedor.

## Arquivos enviados

### Como funciona

1. No Studio, o instrutor escolhe um arquivo. O app web pede os endereços de envio em `POST /api/v1/lessons/:id/video/upload` e depois manda o arquivo **direto para o armazenamento compatível com S3** em fatias de 16 MiB (upload multipart pré-assinado). O arquivo nunca passa pela API.
2. Quando a última fatia chega, o app chama `POST /api/v1/lessons/:id/video/complete`. A API confere se o objeto guardado tem o tamanho anunciado, marca o vídeo como `processing` e enfileira um job `transcode-video`.
3. O worker baixa o original, analisa com `ffprobe` e codifica as versões HLS com `ffmpeg`: **360p, 720p e 1080p, nunca maiores que o original** (um original abaixo de 360p gera uma única versão, na própria altura). Os segmentos têm 6 segundos. Vídeos de celular gravados de lado e marcados como rotacionados são exibidos (e dimensionados) já girados, como os players fazem. O worker também guarda um **quadro de capa** (a um décimo do vídeo, no mínimo 1 segundo) junto das versões; se ele falhar, o vídeo fica pronto do mesmo jeito, só sem capa.
4. Ao terminar, o vídeo passa a `ready`, a aula assume a duração do vídeo, o arquivo original é apagado e um evento `video.processed` é registrado (webhooks podem assiná-lo). Se o arquivo não puder ser lido, o vídeo passa a `error` com uma mensagem e não é tentado de novo; as demais falhas são tentadas mais uma vez.
5. O Studio mostra o estado (enviando, processando, pronto, erro) e se atualiza sozinho enquanto o vídeo é preparado.
6. Admins veem todos os vídeos em `error` em **Admin → Vídeos** (`GET /api/v1/admin/videos/failed`) e podem devolver um ao codificador com **Tentar de novo** (`POST /api/v1/admin/videos/:assetId/retry`). A nova tentativa precisa do arquivo original, que continua no armazenamento após uma falha; se ele sumiu, o instrutor precisa enviar o vídeo de novo.

Um curso publicado mantém um vídeo pronto em cada aula de vídeo que tinha um, então iniciar um envio que substituiria um vídeo pronto ali é recusado (a mesma regra que impede removê-lo). Para trocar esse vídeo, cole um link no lugar, ou volte o curso para rascunho antes. Uma aula de vídeo que ainda não tem vídeo pronto pode receber envios a qualquer momento.

A codificação roda em uma fila própria, com concorrência de um, então um vídeo longo nunca atrasa e-mails ou webhooks, e dois vídeos nunca são codificados ao mesmo tempo. A API e o worker usam a mesma imagem, que inclui o `ffmpeg`.

### Reprodução

O aluno nunca recebe um endereço permanente. `GET /api/v1/videos/:assetId/playback` (logado e com acesso ao curso) devolve o caminho da playlist principal com um token que dura 6 horas, mais `posterUrl`, um endereço pré-assinado do quadro de capa (ou `null` para vídeos codificados antes de existirem capas). Toda requisição de playlist confere o token **e o acesso de novo**, então uma concessão revogada ou expirada barra novas playlists na hora. As playlists de cada versão são reescritas para que cada segmento seja um endereço pré-assinado no armazenamento; os bytes do vídeo vêm direto do armazenamento, não da API. Os endereços dos segmentos duram no mínimo uma hora, ou o dobro da duração do vídeo quando isso for maior.

O player é o [Video.js 10](https://videojs.org) com hls.js. Ele oferece qualidade (automática ou fixa), velocidade, legendas, picture-in-picture e tela cheia, e retoma de onde o aluno parou.

### Configuração

| Variável                          | Padrão                  | Significado                                                                                    |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `S3_ENDPOINT`                     | `http://localhost:9000` | Endereço do armazenamento como a API e o worker o alcançam (dentro do Docker: `http://storage:9000`). |
| `S3_PUBLIC_URL`                   | igual a `S3_ENDPOINT`   | Endereço do armazenamento como os **navegadores** o alcançam. Uploads e segmentos de vídeo vão para ele. |
| `S3_BUCKET`                       | `opencourse`            | Bucket dos vídeos. Precisa existir (o Compose o cria).                                         |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | valores de desenvolvimento | Credenciais. Troque em uma instalação real.                                                 |
| `S3_REGION`                       | `us-east-1`             | Região usada na assinatura.                                                                    |
| `VIDEO_MAX_UPLOAD_BYTES`          | `2147483648` (2 GiB)    | Maior arquivo que um instrutor pode enviar.                                                    |

**O armazenamento precisa ser alcançável pelo navegador.** Em produção, coloque-o atrás de HTTPS em um endereço público e aponte `S3_PUBLIC_URL` para ele. Ao iniciar, a API pede ao armazenamento que permita às suas origens web (`CORS_ORIGINS`) fazer `PUT` e `GET` e que exponha o cabeçalho `ETag`, de que o navegador precisa para concluir um upload multipart. Se o seu armazenamento não suportar a chamada de CORS do bucket, a API registra um aviso e você precisa criar a mesma regra manualmente: origens permitidas = seu app web, métodos `GET`, `HEAD`, `PUT`, cabeçalhos permitidos `*`, cabeçalhos expostos `ETag`. Um envio que falha com "The video upload failed" quase sempre significa que essa regra está faltando.

A codificação consome muita CPU. Dê ao worker núcleos suficientes e disco temporário para o arquivo original mais as versões (o worker grava na pasta temporária do sistema e limpa depois). Uploads que nunca foram concluídos são descartados após 24 horas.

### Uma nota honesta sobre proteção contra download

Dois recursos dificultam o vazamento dos vídeos enviados, sem impedi-lo:

- **Segmentos criptografados (AES-128).** O worker criptografa cada segmento e guarda a chave no armazenamento, junto deles, então o bucket precisa continuar privado (nunca leitura pública). O player busca a chave em `GET /api/v1/videos/:assetId/key`, que confere o token e o acesso como as playlists, então uma concessão revogada deixa de receber a chave. Isso barra downloaders simples que só copiam os segmentos. Vídeos codificados antes desse recurso continuam sem criptografia até um admin enviá-los de novo ao codificador (**Try again**).
- **Marca d'água.** O player mostra o nome e o e-mail do aluno sobre o vídeo, por cerca de 8 segundos a cada 30, sempre em um lugar diferente. Desencoraja o compartilhamento de gravações e mostra de quem veio uma cópia vazada. Vem desligada; admins a ligam em **Admin → Settings → Video**. Ela é desenhada no navegador, então quem abre as ferramentas do desenvolvedor consegue escondê-la.
- **Um vídeo por vez em cada conta.** Uma conta reproduz um vídeo enviado por vez, e o `play` mais novo vence: quando um segundo dispositivo começa a reproduzir, o primeiro pausa e avisa que a conta está sendo usada em outro lugar, com um botão **Assistir aqui** para retomar. Isso mira uma conta dividida por um grupo, já que cada pessoa ficaria interrompendo as outras. Ninguém é barrado no login, e quem tem dois dispositivos só precisa apertar play no que está usando. Vem ligado; admins podem desligar em **Admin → Settings → Video**. Instrutores e admins não têm limite, e vídeos incorporados de provedores externos não são cobertos. O player manda `play` e um `beat` a cada 15 segundos para `POST /api/v1/videos/:assetId/heartbeat`; um dispositivo que para de mandar por 45 segundos libera o vídeo. A rota da chave recusa a sessão que não detém o vídeo (`409`, `error.details.reason` `stream_in_use`), e se a própria checagem falhar o vídeo toca. Quem cumpre a regra é o player e a chave, então um cliente modificado que nunca reporta ainda toca o que já carregou. Isso barra o compartilhamento casual, não quem insiste, e só protege vídeos criptografados (veja acima).
- **Meus dispositivos.** Em **Settings → Dispositivos conectados** o aluno vê onde a conta está conectada (navegador, sistema, último uso e endereço) e desconecta os que não reconhece (`GET /api/v1/me/sessions`, `DELETE /api/v1/me/sessions/:id`).

Mesmo assim, auto-hospedagem não impede uma pessoa determinada de salvar um vídeo. Quem pode assistir também recebe a chave e consegue remontar o arquivo ou gravar a tela. Se o seu conteúdo exige proteção forte (DRM, marca d'água forense, bloqueio por domínio), use um provedor externo que ofereça isso e cole o link dele.

### Migrando de vídeos só com link

Antes dos plugins de provedor, uma aula de vídeo guardava qualquer endereço `https`. Essas aulas são convertidas na leitura: um endereço de um provedor suportado vira um embed de verdade, um link para um arquivo de vídeo vira um link de "Arquivo de vídeo", e qualquer outra coisa (uma página que não é vídeo, por exemplo) aparece como sem vídeo, o que um curso publicado reporta como um vídeo que não está pronto. Os dados antigos não são alterados, então cole um link suportado na aula para corrigir.

## Links de provedores externos

Ao colar um link no Studio, o provedor é escolhido automaticamente pelo endereço. A plataforma guarda o provedor, o identificador do vídeo e o endereço do embed, e mostra o player do provedor em um iframe. O provedor faz o processamento, então o estado é sempre pronto. Esses players não informam a posição, então os alunos marcam essas aulas como concluídas por conta própria. Um link que nenhum provedor reconhece é recusado, porque embutir páginas arbitrárias permitiria a um instrutor colocar qualquer conteúdo diante dos alunos. A única exceção é um link direto para um arquivo de vídeo hospedado por você (veja abaixo), que toca no player da própria plataforma em vez de um iframe.

| Provedor          | Links reconhecidos                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| YouTube           | `youtube.com/watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/` (embutido com o domínio de privacidade reforçada) |
| Vimeo             | `vimeo.com/ID`, `vimeo.com/ID/HASH` (não listado), `player.vimeo.com/video/ID?h=HASH`, links de canal e de álbum |
| Bunny Stream      | `iframe.mediadelivery.net/embed/` ou `/play/` `LIBRARY/VIDEO`                                             |
| Cloudflare Stream | `iframe.videodelivery.net/ID`, `watch.cloudflarestream.com/ID`, `customer-XXXX.cloudflarestream.com/ID`   |
| Panda Video       | `player-vz-XXXX.tv.pandavideo.com.br/embed/?v=VIDEO`                                                      |
| Google Drive      | `drive.google.com/file/d/ID_DO_ARQUIVO/view` (o arquivo precisa estar compartilhado como "qualquer pessoa com o link") |
| Arquivo de vídeo  | Qualquer link `https` terminado em `.mp4`, `.webm`, `.mov`, `.m4v` ou `.m3u8` (uma playlist HLS), sem usuário nem senha |

O player do Google Drive não aceita configuração de qualidade e costuma começar em qualidade baixa, então o aluno vê um aviso abaixo dele para escolher a maior qualidade nas configurações (engrenagem) do player.

Em Administração, Plugins mostra os provedores instalados na instância e liga ou desliga cada um. Os instrutores só podem colar links dos provedores ligados; uma instância nova começa com YouTube e Vimeo ligados e o resto desligado (os outros exigem conta própria no provedor, ou aceitam qualquer host). Desligar um provedor não mexe nas aulas que já o usam, elas continuam tocando; só passa a recusar links novos, no Studio e em `PATCH /lessons/:id`. A lista é a configuração `video.enabledVideoProviders` da plataforma.

### Escrevendo um plugin de provedor

Um provedor é uma pasta em `packages/shared/src/video-providers/` que exporta um `VideoProviderPlugin` (veja `types.ts`), listado em `registry.ts`. Nada mais muda: a API valida links com o registro, o Studio mostra o nome do provedor, o player embute o endereço e a página de Plugins o lista.

```ts
// packages/shared/src/video-providers/example/index.ts
import { normalizedHost, type VideoProviderPlugin } from '../types';

export const examplePlugin: VideoProviderPlugin = {
  id: 'example', // guardado com a aula: nunca o renomeie depois
  label: 'Example Video',
  playback: 'embed',
  // devolve o identificador do provedor para um link que você reconhece, senão null
  match(url) {
    if (normalizedHost(url) !== 'video.example.com') return null;
    const id = url.pathname.split('/').filter(Boolean)[1];
    return id && /^[a-z0-9]{8,}$/i.test(id) ? { externalId: id } : null;
  },
  // o endereço https do iframe do player, montado somente a partir do identificador
  embedUrl: (externalId) => `https://video.example.com/embed/${externalId}`,
};
```

Um plugin declara como toca: `playback: 'embed'` mostra a página do provedor em um iframe, `playback: 'file'` entrega o endereço ao player da própria plataforma (use apenas para endereços que são o próprio vídeo).

Regras que mantêm os embeds seguros: compare o **host exatamente** (nunca com `endsWith` sobre entrada do usuário nem com `includes`), valide o identificador com um padrão estrito e monte o endereço do embed apenas a partir do identificador, em um host que você controla ou que pertence ao provedor. Adicione o plugin a `videoProviders` em `registry.ts` e alguns links a `registry.test.ts`, incluindo endereços quase certos que precisam ser recusados (`example.com.evil.com`).
