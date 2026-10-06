import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import config from '../config/env.js';
import logger from '../config/logger.js';

export function notFoundHandler(req: Request, res: Response) {
  void res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
  });
}

/** Central error handler — never leaks stack traces or secrets. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, 'server error');
    void res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details !== undefined && config.isDev ? { details: err.details } : {}) },
    });
    return;
  }

  const e = err as { name?: string; code?: number | string; message?: string };

  // Mongoose duplicate key
  if (e?.code === 11000) {
    void res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'That already exists.' } });
    return;
  }
  // Mongoose validation
  if (e?.name === 'ValidationError') {
    void res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid.' } });
    return;
  }
  if (e?.name === 'CastError') {
    void res.status(400).json({ success: false, error: { code: 'BAD_ID', message: 'Invalid id.' } });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  void res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again shortly.' },
  });
}
