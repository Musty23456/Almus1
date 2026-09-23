import http from 'http';
import { createApp } from './app';
import { initSocketServer } from './sockets/io';
import { env } from './config/env';

const app = createApp();
const httpServer = http.createServer(app);

initSocketServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`ALMUS CHAT backend listening on port ${env.port} [${env.nodeEnv}]`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
