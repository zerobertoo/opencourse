import { defineConfig } from 'vitest/config';

// end-to-end tests run against the Docker Compose stack, not an in-process app
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/**/*.e2e.test.ts'],
    globalSetup: ['e2e/global-setup.ts'],
    // the resilience test stops and restarts services, so nothing may run alongside it
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
