import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { describeWebhookError } from './webhookError';

describe('describeWebhookError', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR');
  });

  it('translates the messages the API writes', () => {
    expect(describeWebhookError('Destination is not a public address')).toBe(
      'O endereço não é público (aponta para uma rede privada).',
    );
    expect(describeWebhookError('Timed out after 10000 ms')).toBe('Sem resposta após 10000 ms.');
    expect(describeWebhookError('Receiver answered 502')).toBe('O destino respondeu 502.');
  });

  it('follows the interface language', async () => {
    await i18n.changeLanguage('en');
    expect(describeWebhookError('Host did not resolve to any address')).toBe(
      'The host did not resolve to any address.',
    );
  });

  it('shows what it does not know as it came', () => {
    expect(describeWebhookError('connect ECONNREFUSED 10.0.0.5:443')).toBe(
      'connect ECONNREFUSED 10.0.0.5:443',
    );
  });
});
