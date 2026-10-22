import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// PRD v1 acceptance criterion 4: nothing in v1 depends on payment. Access is always a Grant.

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
// deliberately unanchored: it must catch identifiers such as `coursePrice` or `course_price`
const paymentTerms =
  /price|pricing|purchas|payment|checkout|stripe(?!d|s\b)|paypal|billing|invoice|preço|preco|pagamento|\bcompra\b|comprar/i;
// vendor names are anchored where the bare word is common in unrelated packages
const paymentPackages =
  /stripe|paypal|mercadopago|pagseguro|pagarme|pagar\.me|asaas|iugu|hotmart|kiwify|eduzz|braintree|paddle|lemonsqueezy|mollie|razorpay|adyen|^square$|^@square\/|squareup|authorize\.?net/i;

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
    .flatMap((root) => {
      const files = listFiles(join(repoRoot, root));
      // guards against a root that silently scans nothing
      expect(files.length, root).toBeGreaterThan(0);
      return files;
    })
    .filter((file) => /\.(ts|tsx|json|sql)$/.test(file) && !/\.test\.tsx?$/.test(file));
}

describe('no payment dependency', () => {
  it('has no price, purchase or payment wording in code, schema, migrations or UI strings', () => {
    const files = productFiles();
    const offenders = files.filter((file) => paymentTerms.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it('depends on no payment SDK', () => {
    // every workspace package, as in pnpm-workspace.yaml (apps/* and packages/*)
    const manifests = [
      'package.json',
      ...['apps', 'packages'].flatMap((group) =>
        readdirSync(join(repoRoot, group), { withFileTypes: true }).map(
          (entry) => `${group}/${entry.name}/package.json`,
        ),
      ),
    ].filter((manifest) => existsSync(join(repoRoot, manifest)));
    for (const manifest of manifests) {
      const sections = JSON.parse(readFileSync(join(repoRoot, manifest), 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >;
      const names = [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
      ].flatMap((section) => Object.keys(sections[section] ?? {}));
      expect(
        names.filter((name) => paymentPackages.test(name)),
        manifest,
      ).toEqual([]);
    }
  });
});
