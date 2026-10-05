import { defineConfig } from 'tsdown';

export default defineConfig({
  // flat outputs: dist/server.js and dist/migrate.js
  entry: { server: 'src/server.ts', migrate: 'src/db/migrate.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  outExtensions: () => ({ js: '.js' }),
  deps: {
    // @opencourse/shared ships raw TypeScript, so it must be compiled into the bundle
    alwaysBundle: ['@opencourse/shared'],
  },
});
