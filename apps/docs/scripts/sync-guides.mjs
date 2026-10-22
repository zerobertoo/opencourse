// Copies docs/video.md and docs/files.md into the site, so the repository docs stay the single
// source of truth. The H1 becomes the Starlight title and links between guides are rewritten.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsDirectory = join(here, '..', '..', '..', 'docs');
const outputDirectory = join(here, '..', 'src', 'content', 'docs', 'guides');

mkdirSync(outputDirectory, { recursive: true });

for (const name of ['video', 'files']) {
  const source = readFileSync(join(docsDirectory, `${name}.md`), 'utf8').replaceAll('\r\n', '\n');
  const [, title, body] = /^# (.+)\n([\s\S]*)$/.exec(source) ?? [];
  if (!title) throw new Error(`docs/${name}.md must start with an H1`);
  const linked = body
    .replaceAll('](video.md)', '](../video/)')
    .replaceAll('](files.md)', '](../files/)');
  writeFileSync(
    join(outputDirectory, `${name}.md`),
    `---\ntitle: ${JSON.stringify(title)}\n---\n${linked}`,
  );
}
