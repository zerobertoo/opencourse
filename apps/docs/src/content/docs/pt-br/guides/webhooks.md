---
title: Webhooks
description: Envie eventos do OpenCourse para os seus sistemas.
---

Admins cadastram endpoints (URL, eventos, segredo) em **Administração → Webhooks** ou em `/api/v1/admin/webhooks`. Qualquer [evento de domínio](../architecture/#eventos-e-o-worker) pode ser assinado.

## A requisição

Cada evento vira um `POST` com corpo JSON:

```json
{ "id": "…", "type": "enrollment.granted", "createdAt": "2026-10-21T12:00:00.000Z", "data": {} }
```

| Cabeçalho              | Significado                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `OpenCourse-Event`     | O nome do evento.                                                            |
| `OpenCourse-Delivery`  | O id da entrega. A entrega é pelo menos uma vez: deduplique por ele.         |
| `OpenCourse-Signature` | `t=<segundos unix>,v1=<hex>`                                                 |

`v1` é o HMAC-SHA256 de `<t>.<corpo>` com o segredo do endpoint como chave. Rejeite um `t` antigo para barrar replays.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function isValid(secret, header, rawBody, toleranceSeconds = 300) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const received = Buffer.from(v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

## Entrega e novas tentativas

- Qualquer 2xx é sucesso.
- Um erro de rede, timeout (10 s), 5xx, 408 ou 429 é tentado de novo 5 vezes, com espera exponencial.
- Qualquer outro status falha na hora. Redirecionamentos nunca são seguidos.
- O histórico (estado, tentativas, código de status, erro; sem o corpo da resposta) fica por 7 dias, e uma entrega com falha pode ser reenviada pela API ou pela tela.
- `POST /admin/webhooks/:id/test` envia um evento `webhook.test` na hora e mostra a resposta.

## Segurança

O segredo é mostrado uma única vez, ao criar e ao rotacionar. Os destinos precisam ser endereços `https` públicos: faixas de loopback, privadas e link-local são recusadas depois da resolução do DNS, e `http` puro é recusado. Para alcançar um receptor na sua própria rede (n8n, outro contêiner), defina `WEBHOOKS_ALLOW_PRIVATE_NETWORKS=true` na API e no worker, apenas se você confiar em todos os admins.

A ordem não é garantida e as tentativas ainda não são configuráveis por endpoint.
