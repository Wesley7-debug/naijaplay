import crypto from 'node:crypto';
import config from '../config/env.js';
import logger from '../config/logger.js';

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randomChoice<T>(items: T[]): T {
  if (items.length === 0) throw new Error('randomChoice: empty array');
  const idx = crypto.randomInt(items.length);
  return items[idx];
}

/** Cryptographically fair multi-winner selection without replacement. */
export function secureSample<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const idx = crypto.randomInt(pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

const slugAdjectives = ['hot', 'fast', 'loud', 'crazy', 'big', 'chill', 'wild', 'epic'];

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = crypto.randomInt(1000, 9999);
  return `${base || slugAdjectives[crypto.randomInt(slugAdjectives.length)]}-${suffix}`;
}

/** Human-friendly room code like LAG-8X2K. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateRoomCode(prefix?: string): string {
  const p = (prefix || 'NGA').toUpperCase().slice(0, 3).padEnd(3, 'X');
  let body = '';
  for (let i = 0; i < 4; i += 1) body += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `${p}-${body}`;
}

export function shortId(len = 8): string {
  return crypto.randomBytes(16).toString('hex').slice(0, len);
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = Buffer.from(sha256(a));
  const hb = Buffer.from(sha256(b));
  if (ha.length !== hb.length) return false;
  return crypto.timingSafeEqual(ha, hb);
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function publicUrl(path: string): string {
  const base = config.serverUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
