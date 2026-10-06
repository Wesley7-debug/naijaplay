import type { Request, Response, NextFunction } from 'express';

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, 201);
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wrap async route handlers so errors flow to the error middleware. */
export function handler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
