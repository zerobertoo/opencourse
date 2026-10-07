import pino from 'pino';
import { loadConfig } from './config';
import { startWorker } from './worker/runtime';

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const worker = await startWorker(config, { logger });
logger.info('worker started');

// let the running job finish and connections close on container stop
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    worker.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
