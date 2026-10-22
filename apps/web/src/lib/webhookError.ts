import i18n from '@/i18n';

/** Messages the API writes in English, matched by shape and shown through i18n. */
const KNOWN_ERRORS: ReadonlyArray<{ pattern: RegExp; key: string; values?: string[] }> = [
  { pattern: /^Invalid URL$/, key: 'invalidUrl' },
  { pattern: /^(Only https is allowed here|Webhook URLs must use https)$/, key: 'httpsOnly' },
  { pattern: /^Destination is not a public address$/, key: 'notPublic' },
  { pattern: /^Host did not resolve to any address$/, key: 'noAddress' },
  { pattern: /^Timed out after (\d+) ms$/, key: 'timedOut', values: ['ms'] },
  { pattern: /^Connection closed before the response ended$/, key: 'connectionClosed' },
  { pattern: /^Receiver answered (\d+)$/, key: 'receiverAnswered', values: ['status'] },
  { pattern: /^Endpoint was disabled before delivery$/, key: 'disabled' },
];

/**
 * A delivery or test error in the interface language. Messages the app does not know, such as
 * the network error text a receiver's host produced, are shown as they came.
 */
export function describeWebhookError(error: string): string {
  for (const { pattern, key, values } of KNOWN_ERRORS) {
    const match = pattern.exec(error);
    if (!match) continue;
    const params = Object.fromEntries(
      (values ?? []).map((name, index) => [name, match[index + 1]]),
    );
    return i18n.t(`admin:webhooks.errors.${key}` as never, params);
  }
  return error;
}
