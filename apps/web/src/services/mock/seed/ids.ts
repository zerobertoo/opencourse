import { v5 as uuidV5 } from 'uuid';

/** Fixed namespaces: ids derived from them never change between runs or releases. */
const DEMO_NAMESPACE = 'b3b0a8f6-52f4-4d6e-9d2a-6f1c0e7a9c10';
const GENERATED_NAMESPACE = '7d1f4e0a-3c58-4b9e-8a2d-91c6e5b0f3a7';

/** Stable UUID for a readable key such as `course-javascript`. */
export function demoId(key: string): string {
  return uuidV5(key, DEMO_NAMESPACE);
}

/** Deterministic id for the n-th entity the mock creates with a prefix (`course`, `lesson`...). */
export function generatedId(prefix: string, counter: number): string {
  return uuidV5(`${prefix}_${counter}`, GENERATED_NAMESPACE);
}

function collectIds(node: unknown, ids: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectIds(item, ids));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'id' && typeof value === 'string') ids.add(value);
      else collectIds(value, ids);
    }
  }
}

function remap(node: unknown, ids: ReadonlySet<string>): unknown {
  if (typeof node === 'string') return ids.has(node) ? demoId(node) : node;
  if (Array.isArray(node)) return node.map((item) => remap(item, ids));
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        ids.has(key) ? demoId(key) : key,
        remap(value, ids),
      ]),
    );
  }
  return node;
}

/**
 * Turns the readable ids of the seed (`course-javascript`) into UUIDs. Every value stored under an
 * `id` key is a readable id; any string or record key that equals one of them, anywhere in the
 * tree, is a reference to it and is rewritten the same way. Strings that merely contain an id
 * (such as URLs) are left alone.
 */
export function convertIdsToUuids<T>(tree: T): T {
  const ids = new Set<string>();
  collectIds(tree, ids);
  return remap(tree, ids) as T;
}
