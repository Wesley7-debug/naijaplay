import pino from 'pino';
import config from './env.js';

const logger = pino({
  level: process.env.LOG_LEVEL || (config.isTest ? 'silent' : 'info'),
  base: { app: 'naijaplay' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'secret',
      'token',
      '*.secret',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
