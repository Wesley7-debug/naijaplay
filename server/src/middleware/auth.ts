import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { resolveUser } from '../services/auth.service.js';
import type { UserDoc } from '../models/index.js';
import type { UserRole } from '@naijaplay/shared';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserDoc | null;
  }
}

/** Require an authenticated, non-suspended user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await resolveUser(req);
    if (!user) throw AppError.unauthorized();
    if (user.isSuspended) throw AppError.forbidden('SUSPENDED', 'Your account is suspended.');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Attach user when present; never blocks. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await resolveUser(req);
    next();
  } catch {
    req.user = null;
    next();
  }
}

/** Role-based access control — enforced server-side only. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(AppError.unauthorized());
    if (roles.includes(user.role)) return next();
    return next(AppError.forbidden());
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void requireRole('admin')(req, res, (err?: unknown) => {
    if (err) return next(err);
    return next();
  });
}

/** Convenience accessor for handlers that already ran through requireAuth. */
export function currentUser(req: Request): UserDoc {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
