import type { Request, Response } from 'express';
import config from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { sha256, randomToken, slugify } from '../utils/crypto.js';
import { MagicLink, Session, User, type IUser, type UserDoc } from '../models/index.js';
import { sendEmail, magicLinkEmail } from './email.service.js';
import logger from '../config/logger.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = config.cookie.maxAgeDays * 24 * 60 * 60 * 1000;

function setSessionCookie(res: Response, token: string) {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/',
  });
}

export async function createSession(userId: string, req: Request, res: Response): Promise<void> {
  const token = randomToken(32);
  await Session.create({
    userId,
    tokenHash: sha256(token),
    userAgent: (req.headers['user-agent'] || '').slice(0, 300),
    ip: req.ip || '',
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  setSessionCookie(res, token);
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[config.cookie.name];
  if (token) {
    await Session.deleteOne({ tokenHash: sha256(token) });
  }
  clearSessionCookie(res);
}

/** Resolve the current user from the session cookie. Returns null when absent/invalid. */
export async function resolveUser(req: Request): Promise<UserDoc | null> {
  const token = req.cookies?.[config.cookie.name];
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: sha256(token) });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await Session.deleteOne({ _id: session._id });
    return null;
  }
  const user = await User.findById(session.userId);
  if (!user) return null;
  if (user.isSuspended) return null;
  // Touch lastSeenAt lazily (max once a minute) without blocking the request path.
  if (Date.now() - user.lastSeenAt.getTime() > 60_000) {
    void User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } }).exec();
  }
  return user;
}

export async function createMagicLink(email: string): Promise<{ token: string; expiresAt: Date; delivered: boolean; provider: string }> {
  const normalized = email.trim().toLowerCase();
  const token = randomToken(24);
  await MagicLink.create({
    email: normalized,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  const link = `${config.serverUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: normalized,
    subject: 'Sign in to NaijaPlay',
    html: magicLinkEmail(link),
    text: `Sign in to NaijaPlay: ${link} (valid 15 minutes, single use)`,
  });
  return { token, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS), delivered: sent.delivered, provider: sent.provider };
}

/** Verify a magic link token: enforces expiry AND single use (atomic consume). */
export async function consumeMagicLink(token: string): Promise<string> {
  const hash = sha256(token);
  // Atomic single-use consume: only one request can flip usedAt from null.
  const updated = await MagicLink.findOneAndUpdate(
    { tokenHash: hash, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    const existing = await MagicLink.findOne({ tokenHash: hash });
    if (existing && existing.usedAt) {
      throw new AppError(400, 'MAGIC_LINK_USED', 'This sign-in link has already been used. Request a new one.');
    }
    if (existing) {
      throw new AppError(400, 'MAGIC_LINK_EXPIRED', 'This sign-in link has expired. Request a new one.');
    }
    throw new AppError(400, 'MAGIC_LINK_INVALID', 'This sign-in link is not valid.');
  }
  return updated.email;
}

function sanitizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = sanitizeUsername(base) || `player${Math.floor(Math.random() * 9000 + 1000)}`;
  if (candidate.length < 3) candidate = `${candidate}play`.slice(0, 24);
  let attempt = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await User.exists({ username: candidate })) {
    attempt += 1;
    candidate = `${sanitizeUsername(base).slice(0, 18)}${Math.floor(Math.random() * 9000 + 1000)}`.slice(0, 24);
    if (attempt > 20) {
      candidate = `player_${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      break;
    }
  }
  return candidate;
}

/** Find or create a user by email (magic link + Google share this path). */
export async function findOrCreateUser(opts: {
  email: string;
  googleId?: string;
  displayName?: string;
  avatar?: string;
  emailVerified?: boolean;
}): Promise<{ user: UserDoc; isNew: boolean }> {
  const email = opts.email.trim().toLowerCase();
  let user = await User.findOne({ $or: [{ email }, ...(opts.googleId ? [{ googleId: opts.googleId }] : [])] });

  if (user) {
    const updates: Partial<IUser> = {};
    if (opts.googleId && !user.googleId) updates.googleId = opts.googleId;
    if (opts.avatar && !user.avatar) updates.avatar = opts.avatar;
    if (opts.emailVerified && !user.emailVerified) updates.emailVerified = true;
    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      user = (await User.findById(user._id)) as UserDoc;
    }
    return { user, isNew: false };
  }

  const displayName = (opts.displayName || email.split('@')[0]).slice(0, 50);
  const username = await uniqueUsername(sanitizeUsername(displayName) || email.split('@')[0]);
  user = await User.create({
    email,
    emailVerified: opts.emailVerified ?? false,
    googleId: opts.googleId ?? null,
    username,
    displayName,
    avatar: opts.avatar ?? null,
    onboardingComplete: false,
    lastSeenAt: new Date(),
  });
  return { user, isNew: true };
}

export function redirectAfterAuth(res: Response, isNew: boolean) {
  const target = `${config.clientUrl.replace(/\/$/, '')}/auth/callback?new=${isNew ? '1' : '0'}`;
  res.redirect(target);
}

// ---- Google OAuth ----

export function googleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.serverUrl}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    access_type: 'online',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{
  email: string;
  googleId: string;
  displayName: string;
  avatar?: string;
}> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: `${config.serverUrl}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, 'google token exchange failed');
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in failed. Try again.');
  }
  const tokens = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) {
    throw new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in failed. Try again.');
  }
  const info = (await infoRes.json()) as { id: string; email: string; verified_email?: boolean; name?: string; picture?: string };
  return {
    email: info.email,
    googleId: info.id,
    displayName: info.name || info.email.split('@')[0],
    avatar: info.picture,
  };
}

export { slugify };
