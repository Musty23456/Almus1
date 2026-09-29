import http from 'http';
import { createApp } from './app';
import { initSocketServer } from './sockets/io';
import { env } from './config/env';
import { isPushConfigured } from './services/push';

const app = createApp();
const httpServer = http.createServer(app);

initSocketServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`ALMUS CHAT backend listening on port ${env.port} [${env.nodeEnv}]`);
  console.log(
    isPushConfigured()
      ? '[push] Firebase key loaded - push notifications are ON'
      : '[push] NO Firebase key (FCM_SERVICE_ACCOUNT_JSON) - push notifications are OFF'
  );
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
