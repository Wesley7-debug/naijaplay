import path from 'node:path';
import fs from 'node:fs';

function loadEnvFile() {
  // Load .env from repo root if present (dev convenience; process.env wins).
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    break;
  }
}
loadEnvFile();

const env = process.env.NODE_ENV ?? 'development';
const isProd = env === 'production';
const isTest = env === 'test';

function required(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') {
    if (isTest) return `test-${key.toLowerCase()}`;
    if (isProd) throw new Error(`Missing required env var: ${key}`);
    return '';
  }
  return v;
}

export const config = {
  env,
  isProd,
  isTest,
  isDev: !isProd && !isTest,
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/naijaplay'),
  sessionSecret: required('SESSION_SECRET', 'dev-only-session-secret-change-me'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // RENDER_EXTERNAL_URL is set automatically by Render (e.g. https://naijaplay-x.onrender.com).
  serverUrl: process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:4000',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'log',
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || 'NaijaPlay <no-reply@naijaplay.com>',
    gmailUser: process.env.EMAIL_GMAIL_USER || '',
    gmailPass: process.env.EMAIL_GMAIL_APP_PASSWORD || '',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    get enabled() {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },
  cookie: {
    name: 'np_session',
    secure: isProd && process.env.NODE_ENV !== 'test-production',
    sameSite: 'lax' as const,
    // Split-origin deploys (app + api on subdomains of one parent):
    // set COOKIE_DOMAIN=.naijaplay.com so both hosts share the session.
    domain: process.env.COOKIE_DOMAIN || '',
    maxAgeDays: 30,
  },
  trustProxy: process.env.RATE_LIMIT_TRUST_PROXY === '1',
} as const;

export default config;
