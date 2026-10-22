// Copies docs/video.md and docs/files.md (and their docs/pt-BR translations) into the site, so the
// repository docs stay the single source of truth. The H1 becomes the Starlight title and links
// between guides are rewritten. Pass --watch to copy again whenever a source changes, with the dev
// server running alongside.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsDirectory = join(here, '..', '..', '..', 'docs');
const siteDirectory = join(here, '..', 'src', 'content', 'docs');

const GUIDES = ['video', 'files'];

// repository folder -> site folder
const locales = [
  { source: docsDirectory, target: join(siteDirectory, 'guides') },
  { source: join(docsDirectory, 'pt-BR'), target: join(siteDirectory, 'pt-br', 'guides') },
];

/** Rewrites `[text](video.md#anchor)` to the site path, leaving fenced code blocks untouched. */
function rewriteGuideLinks(markdown) {
  const guideLink = new RegExp(`\\]\\((?:\\./)?(${GUIDES.join('|')})\\.md(#[^)]*)?\\)`, 'g');
  return markdown
    .split(/(^```[\s\S]*?^```)/m)
    .map((part) => (part.startsWith('```') ? part : part.replace(guideLink, '](../$1/$2)')))
    .join('');
}

/** A relative `.md` link that is not a synced guide would be dead on the site: fail loudly. */
function assertNoDeadLinks(markdown, file) {
  const outsideCode = markdown.replace(/^```[\s\S]*?^```/gm, '');
  for (const [, target] of outsideCode.matchAll(/\]\((?!https?:|#|\.\.\/)([^)\s]*\.md)(?:#[^)]*)?\)/g)) {
    throw new Error(`${file}: link to ${target} would be dead on the site; add it to GUIDES`);
  }
}

function sync() {
  for (const { source, target } of locales) {
    mkdirSync(target, { recursive: true });
    for (const name of GUIDES) {
      const file = join(source, `${name}.md`);
      if (!existsSync(file)) throw new Error(`${file} is missing`);
      const text = readFileSync(file, 'utf8').replace(/^﻿/, '').replaceAll('\r\n', '\n');
      const [, title, body] = /^# (.+)\n([\s\S]*)$/.exec(text) ?? [];
      if (!title) throw new Error(`${file} must start with an H1 (no front matter)`);
      const linked = rewriteGuideLinks(body);
      assertNoDeadLinks(linked, file);
      writeFileSync(
        join(target, `${name}.md`),
        `---\ntitle: ${JSON.stringify(title)}\n---\n${linked}`,
      );
    }
  }
}

sync();

if (process.argv.includes('--watch')) {
  for (const { source } of locales) {
    watch(source, (_event, filename) => {
      if (!filename?.endsWith('.md')) return;
      try {
        sync();
      } catch (error) {
        console.error(error.message);
      }
    });
  }
  // runs the dev server in the same terminal; stopping it stops the watcher too
  const server = spawn('astro', ['dev'], { stdio: 'inherit', shell: true });
  server.on('exit', (code) => process.exit(code ?? 0));
}
