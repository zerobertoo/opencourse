import { defineConfig } from 'tsdown';

export default defineConfig({
  // flat outputs: dist/server.js, dist/worker.js, dist/migrate.js and dist/seed-demo.js
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    migrate: 'src/db/migrate.ts',
    'seed-demo': 'src/db/seed-demo.ts',
  },
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
