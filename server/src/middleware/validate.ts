import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

export function validate(schema: z.ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      const message = first ? `${first.path.join('.') || source}: ${first.message}` : 'Invalid request.';
      return next(AppError.badRequest('VALIDATION_ERROR', message, result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
    }
    // Assign parsed (coerced/defaulted) value back.
    (req as unknown as Record<string, unknown>)[source] = result.data;
    return next();
  };
}
