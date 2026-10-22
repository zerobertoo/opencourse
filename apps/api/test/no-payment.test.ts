import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// PRD v1 acceptance criterion 4: nothing in v1 depends on payment. Access is always a Grant.

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const paymentTerms =
  /price|purchas|payment|checkout|stripe|paypal|billing|invoice|preço|preco|pagamento|\bcompra\b|comprar/i;
const paymentPackages =
  /stripe|paypal|mercadopago|pagseguro|braintree|paddle|lemonsqueezy|pagarme/i;

/** Lists files under a directory, skipping build output and dependencies. */
function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'build', '.turbo'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Source, schema and migration files of the product (docs and tests may mention the absence). */
function productFiles(): string[] {
  const roots = ['apps/api/src', 'apps/api/migrations', 'apps/web/src', 'packages/shared/src'];
  return roots
    .flatMap((root) => listFiles(join(repoRoot, root)))
    .filter((file) => /\.(ts|tsx|json|sql)$/.test(file) && !/\.test\.tsx?$/.test(file));
}

describe('no payment dependency', () => {
  it('has no price, purchase or payment wording in code, schema, migrations or UI strings', () => {
    const files = productFiles();
    // guards against a scan that silently finds nothing
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((file) => paymentTerms.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it('depends on no payment SDK', () => {
    const manifests = ['package.json', 'apps/api/package.json', 'apps/web/package.json'];
    for (const manifest of manifests) {
      const { dependencies = {}, devDependencies = {} } = JSON.parse(
        readFileSync(join(repoRoot, manifest), 'utf8'),
      ) as Record<string, Record<string, string> | undefined>;
      const names = Object.keys({ ...dependencies, ...devDependencies });
      expect(
        names.filter((name) => paymentPackages.test(name)),
        manifest,
      ).toEqual([]);
    }
  });
});
