import http from 'node:http';
import config from './config/env.js';
import logger from './config/logger.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { createSocketServer } from './sockets/index.js';
import { startJobs } from './jobs/scheduler.js';

async function main() {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);
  startJobs();

  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, `NaijaPlay API listening on :${config.port}`);
    if (!config.isProd) {
      // eslint-disable-next-line no-console
      console.log(`\n🟢 NaijaPlay server → ${config.serverUrl}\n   client: ${config.clientUrl}\n   google oauth: ${config.google.enabled ? 'enabled' : 'DISABLED (set GOOGLE_CLIENT_ID/SECRET)'}\n   payments: manual bank transfer in chat (no online checkout)\n   storage: ${config.cloudinary.enabled ? 'Cloudinary' : 'local disk (development)'}\n`);
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
