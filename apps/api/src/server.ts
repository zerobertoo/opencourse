import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp(config);

// browsers upload video parts to the storage and read segments from it, which needs CORS there;
// a storage that refuses the call keeps working for everything else
await app.storage
  .allowBrowserAccess(config.CORS_ORIGINS)
  .catch((error: unknown) => app.log.warn({ err: error }, 'could not configure storage CORS'));

// let in-flight requests finish and connections close on container stop
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
