import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import config from './config/env.js';
import logger from './config/logger.js';
import { corsMiddleware, securityHeaders, sanitize, noPrototypePollution, rateLimits } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import homeRoutes from './routes/home.routes.js';
import roomRoutes from './routes/room.routes.js';
import eventRoutes from './routes/event.routes.js';
import userRoutes from './routes/user.routes.js';
import crewRoutes from './routes/crew.routes.js';
import momentRoutes from './routes/moment.routes.js';
import gameRoutes from './routes/game.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import reportRoutes from './routes/report.routes.js';
import adminRoutes from './routes/admin.routes.js';
import seasonRoutes from './routes/season.routes.js';
import sponsorRoutes from './routes/sponsor.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import globalRoutes from './routes/global.routes.js';
import uploadRoutes from './routes/upload.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(
    express.json({
      limit: '1mb',
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(sanitize);
  app.use(noPrototypePollution);
  app.use(rateLimits.general);

  // Structured request logging (skip noisy test output).
  if (!config.isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        if (req.path.startsWith('/api')) {
          logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }, 'request');
        }
      });
      next();
    });
  }

  // Local uploads (development storage when Cloudinary not configured).
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', env: config.env, time: new Date().toISOString() } });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', homeRoutes); // /api/home, /api/search, /api/leaderboards, /api/sponsors/active
  app.use('/api/rooms', roomRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/crews', crewRoutes);
  app.use('/api/moments', momentRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/seasons', seasonRoutes);
  app.use('/api/competitions', seasonRoutes);
  app.use('/api/sponsors', sponsorRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/global', globalRoutes);
  app.use('/api/uploads', uploadRoutes);

  // Single-service publish: serve the built client (client/dist) from the API
  // origin so cookies + websocket need no CORS. Enable with SERVE_CLIENT=1
  // after running `npm run build` at the repo root.
  const clientDist =
    process.env.CLIENT_DIST || path.resolve(process.cwd(), '../client/dist');
  if (process.env.SERVE_CLIENT === '1' && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { maxAge: '1h', immutable: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    logger.info({ clientDist }, 'serving client');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
