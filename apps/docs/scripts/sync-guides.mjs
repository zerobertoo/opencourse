// Copies docs/video.md and docs/files.md (and their docs/pt-BR translations) into the site, so the
// repository docs stay the single source of truth. The H1 becomes the Starlight title and links
// between guides are rewritten.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsDirectory = join(here, '..', '..', '..', 'docs');
const siteDirectory = join(here, '..', 'src', 'content', 'docs');

// repository folder -> site folder
const locales = [
  { source: docsDirectory, target: join(siteDirectory, 'guides') },
  { source: join(docsDirectory, 'pt-BR'), target: join(siteDirectory, 'pt-br', 'guides') },
];

for (const { source, target } of locales) {
  mkdirSync(target, { recursive: true });
  for (const name of ['video', 'files']) {
    const text = readFileSync(join(source, `${name}.md`), 'utf8').replaceAll('\r\n', '\n');
    const [, title, body] = /^# (.+)\n([\s\S]*)$/.exec(text) ?? [];
    if (!title) throw new Error(`${source}/${name}.md must start with an H1`);
    const linked = body
      .replace(/\]\((?:\.\/)?(video|files)\.md(#[^)]*)?\)/g, '](../$1/$2)');
    writeFileSync(
      join(target, `${name}.md`),
      `---\ntitle: ${JSON.stringify(title)}\n---\n${linked}`,
    );
  }
}
