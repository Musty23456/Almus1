import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimiters';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import conversationRoutes from './routes/conversationRoutes';
import messageRoutes from './routes/messageRoutes';
import groupRoutes from './routes/groupRoutes';
import reportRoutes from './routes/reportRoutes';
import adminRoutes from './routes/adminRoutes';
import deviceRoutes from './routes/deviceRoutes';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Trust proxy so req.ip / rate limiting work correctly behind Render/Railway/etc.
  app.set('trust proxy', 1);

  app.use('/api', apiLimiter);

  // Uploaded media (dev/local storage adapter). In production, swap for an
  // object-storage adapter and serve via signed URLs instead of static files.
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir)));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'almus-chat-backend' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/devices', deviceRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
