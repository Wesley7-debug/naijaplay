import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import { fail } from '../utils/http.js';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://*.googleusercontent.com', 'https://i.pravatar.cc'],
      mediaSrc: ["'self'", 'blob:', 'https://res.cloudinary.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Allow same-origin / server-to-server (no origin) and configured client origins.
    if (!origin) return cb(null, true);
    const allowed = [config.clientUrl, config.serverUrl];
    if (config.isDev) allowed.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000');
    if (allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  maxAge: 600,
});

export const sanitize = mongoSanitize({
  onSanitize: ({ req }: { req: Request }) => {
    // structured log hook — keep quiet in tests
    if (config.isTest) return;
    void req;
  },
  replaceWith: '_',
} as never);

/** Simple in-memory rate limiter factory with per-route config. */
export function limiter(opts: { windowMs: number; max: number; message?: string; code?: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.isTest && process.env.TEST_RATE_LIMIT !== '1',
    handler: (req: Request, res: Response) => {
      void req;
      fail(res, 429, opts.code || 'RATE_LIMITED', opts.message || 'Too many requests. Slow down a bit.');
    },
  });
}

/** Route-specific rate limit presets required by the spec. */
export const rateLimits = {
  magicLink: limiter({ windowMs: 15 * 60_000, max: 5, message: 'Too many sign-in links requested. Try again later.', code: 'MAGIC_LINK_RATE_LIMIT' }),
  roomCreate: limiter({ windowMs: 60 * 60_000, max: 20, message: 'You are creating rooms too quickly.', code: 'ROOM_CREATE_RATE_LIMIT' }),
  messages: limiter({ windowMs: 10_000, max: 15, message: 'You are sending messages too fast.', code: 'MESSAGE_RATE_LIMIT' }),
  reactions: limiter({ windowMs: 10_000, max: 30, message: 'Slow down with the reactions.', code: 'REACTION_RATE_LIMIT' }),
  follows: limiter({ windowMs: 60_000, max: 30, message: 'Too many follow actions.', code: 'FOLLOW_RATE_LIMIT' }),
  giveawayEntries: limiter({ windowMs: 60_000, max: 20, message: 'Too many giveaway entries.', code: 'GIVEAWAY_RATE_LIMIT' }),
  quizAnswers: limiter({ windowMs: 5_000, max: 8, message: 'Too many answers.', code: 'QUIZ_RATE_LIMIT' }),
  uploads: limiter({ windowMs: 60_000, max: 30, message: 'Too many uploads.', code: 'UPLOAD_RATE_LIMIT' }),
  reports: limiter({ windowMs: 60 * 60_000, max: 20, message: 'Too many reports. Our moderators will get to existing ones.', code: 'REPORT_RATE_LIMIT' }),
  auth: limiter({ windowMs: 15 * 60_000, max: 50, code: 'AUTH_RATE_LIMIT' }),
  general: limiter({ windowMs: 60_000, max: 300, code: 'GENERAL_RATE_LIMIT' }),
};

/** Reject non-GET bodies containing prototype-pollution style keys. */
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
export function noPrototypePollution(req: Request, res: Response, next: NextFunction) {
  const check = (obj: unknown): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      if (BAD_KEYS.includes(key)) return true;
      const value = (obj as Record<string, unknown>)[key];
      if (value && typeof value === 'object' && check(value)) return true;
    }
    return false;
  };
  if (check(req.body) || check(req.query) || check(req.params)) {
    return fail(res, 400, 'BAD_REQUEST', 'Invalid request payload.');
  }
  return next();
}
