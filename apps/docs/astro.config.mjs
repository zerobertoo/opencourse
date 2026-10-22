import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// The demo lives at the site root today, so the docs get their own path under the same Pages site
const base = process.env.DOCS_BASE ?? '/';

// full address of the published site (canonical links and the sitemap); optional locally
const site = process.env.DOCS_SITE;

export default defineConfig({
  ...(site ? { site } : {}),
  base,
  integrations: [
    starlight({
      title: 'OpenCourse',
      description: 'Open source, self-hosted course platform.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/zerobertoo/opencourse' },
      ],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        'pt-br': { label: 'Português (Brasil)', lang: 'pt-BR' },
      },
      sidebar: [
        {
          label: 'Start here',
          translations: { 'pt-BR': 'Comece aqui' },
          items: [
            { slug: 'guides/self-hosting' },
            { slug: 'guides/architecture' },
          ],
        },
        {
          label: 'Guides',
          translations: { 'pt-BR': 'Guias' },
          items: [
            { slug: 'guides/video' },
            { slug: 'guides/files' },
            { slug: 'guides/webhooks' },
          ],
        },
      ],
    }),
  ],
});
