import type { DomainEventName } from '@opencourse/shared';

type CamelCase<Name extends string> = Name extends `${infer Head}.${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : Name;

/**
 * Key of an event in the i18n files: `user.created` becomes `userCreated`, because a dot inside
 * a key would read as a nesting level.
 */
export function webhookEventKey<Name extends DomainEventName>(name: Name): CamelCase<Name> {
  return name.replace(/\.(\w)/g, (_match, letter: string) =>
    letter.toUpperCase(),
  ) as CamelCase<Name>;
}
