export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(code = 'UNAUTHORIZED', message = 'You need to sign in.') {
    return new AppError(401, code, message);
  }
  static forbidden(code = 'FORBIDDEN', message = 'You do not have permission to do that.') {
    return new AppError(403, code, message);
  }
  static notFound(code = 'NOT_FOUND', message = 'Not found.') {
    return new AppError(404, code, message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new AppError(409, code, message, details);
  }
  static tooMany(code = 'RATE_LIMITED', message = 'Too many requests. Slow down a bit.') {
    return new AppError(429, code, message);
  }
  static internal(message = 'Something went wrong.') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
