import { SUPPORTED_LOCALES } from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import { NAMESPACES, resources } from './resources';

/** Lists the keys of a nested object in the `a.b.c` format. */
function flattenKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? flattenKeys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** Extracts the names of top-level ICU arguments (`{count, plural, ...}`), ignoring branches. */
function icuArguments(message: string): string[] {
  const names: string[] = [];
  let depth = 0;
  for (let index = 0; index < message.length; index++) {
    const char = message[index];
    if (char === '{') {
      if (depth === 0) {
        names.push(/^\s*(\w+)/.exec(message.slice(index + 1))![1]!);
      }
      depth++;
    } else if (char === '}') {
      depth--;
    }
  }
  return names.sort();
}

function messageAt(tree: object, path: string): string {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], tree) as string;
}

describe('i18n resources', () => {
  it.each(NAMESPACES)('namespace "%s" has the same keys in every locale', (namespace) => {
    const [reference, ...others] = SUPPORTED_LOCALES;
    const referenceKeys = flattenKeys(resources[reference!][namespace]).sort();
    for (const locale of others) {
      expect(flattenKeys(resources[locale][namespace]).sort(), `${locale}:${namespace}`).toEqual(
        referenceKeys,
      );
    }
  });

  it('uses the same ICU arguments in every locale and never leaves empty messages', () => {
    for (const namespace of NAMESPACES) {
      for (const key of flattenKeys(resources['pt-BR'][namespace])) {
        const ptBR = messageAt(resources['pt-BR'][namespace], key);
        const en = messageAt(resources.en[namespace], key);
        expect(ptBR.trim(), `pt-BR:${namespace}.${key}`).not.toBe('');
        expect(en.trim(), `en:${namespace}.${key}`).not.toBe('');
        expect(icuArguments(en), `${namespace}.${key}`).toEqual(icuArguments(ptBR));
      }
    }
  });
});
