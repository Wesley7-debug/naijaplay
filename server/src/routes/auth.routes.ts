import { Router } from 'express';
import {
  magicLinkSchema,
  magicRequestSchema,
  onboardingSchema,
} from '@naijaplay/shared';
import { handler, ok, created, fail } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { rateLimits } from '../middleware/security.js';
import { requireAuth, optionalAuth, currentUser } from '../middleware/auth.js';
import {
  createMagicLink,
  consumeMagicLink,
  createSession,
  destroySession,
  findOrCreateUser,
  googleAuthUrl,
  exchangeGoogleCode,
  redirectAfterAuth,
} from '../services/auth.service.js';
import config from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { User, Game, CrewMember, Crew } from '../models/index.js';
import { NIGERIAN_AREAS } from '@naijaplay/shared';
import logger from '../config/logger.js';

const router = Router();

function serializeCurrentUser(user: InstanceType<typeof User>) {
  return {
    id: String(user._id),
    email: user.email,
    emailVerified: user.emailVerified,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar ?? null,
    bio: user.bio || '',
    location: user.location || '',
    favoriteGames: user.favoriteGames.map(String),
    customGames: user.customGames || [],
    interests: user.interests || [],
    socialLinks: user.socialLinks || {},
    role: user.role,
    isVerified: user.isVerified,
    isSuspended: user.isSuspended,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    roomsHostedCount: user.roomsHostedCount,
    eventsJoinedCount: user.eventsJoinedCount,
    winsCount: user.winsCount,
    giveawaysWonCount: user.giveawaysWonCount,
    xp: user.xp,
    level: user.level,
    badges: user.badges,
    achievements: user.achievements,
    onboardingComplete: user.onboardingComplete,
    lastSeenAt: user.lastSeenAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
  };
}

/** POST /api/auth/magic-link — request a sign-in link (rate-limited). */
router.post(
  '/magic-link',
  rateLimits.magicLink,
  validate(magicRequestSchema),
  handler(async (req, res) => {
    const { email } = req.body as { email: string };
    const sent = await createMagicLink(email);
    if (!sent.delivered) {
      throw new AppError(502, 'EMAIL_FAILED', 'Could not send the sign-in email. Try again in a bit.');
    }
    // Same response regardless of whether the email exists (no user enumeration).
    return ok(res, {
      message: 'Check your email — your sign-in link is on the way.',
      devNote: config.isDev ? 'In development the link is printed in the server console.' : undefined,
    });
  }),
);

/** GET /api/auth/verify?token= — consume magic link, set session, redirect. */
router.get(
  '/verify',
  handler(async (req, res) => {
    const token = String(req.query.token || '');
    if (!token) throw AppError.badRequest('MISSING_TOKEN', 'Missing sign-in token.');
    const email = await consumeMagicLink(token);
    const { user, isNew } = await findOrCreateUser({ email, emailVerified: true });
    await createSession(String(user._id), req, res);
    redirectAfterAuth(res, isNew);
  }),
);

/** POST /api/auth/google — start Google OAuth. */
router.get('/google', (req, res) => {
  if (!config.google.enabled) {
    return fail(res, 501, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured on this server.');
  }
  const next = typeof req.query.next === 'string' ? req.query.next : '/';
  return res.redirect(googleAuthUrl());
});

router.get(
  '/google/callback',
  handler(async (req, res) => {
    const code = String(req.query.code || '');
    if (!code) throw AppError.badRequest('MISSING_CODE', 'Google did not send an authorisation code.');
    const profile = await exchangeGoogleCode(code);
    const { user, isNew } = await findOrCreateUser({
      email: profile.email,
      googleId: profile.googleId,
      displayName: profile.displayName,
      avatar: profile.avatar,
      emailVerified: true,
    });
    await createSession(String(user._id), req, res);
    redirectAfterAuth(res, isNew);
  }),
);

/** GET /api/auth/me */
router.get(
  '/me',
  optionalAuth,
  handler(async (req, res) => {
    if (!req.user) return ok(res, { user: null });
    const user = await User.findById(req.user._id);
    return ok(res, { user: user ? serializeCurrentUser(user) : null });
  }),
);

/** POST /api/auth/logout */
router.post(
  '/logout',
  handler(async (req, res) => {
    await destroySession(req, res);
    return ok(res, { ok: true });
  }),
);

/** POST /api/auth/onboarding — profile setup after first login. */
router.post(
  '/onboarding',
  requireAuth,
  validate(onboardingSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    // Already onboarded? Never run it twice — hand back the profile untouched.
    if (user.onboardingComplete) {
      return ok(res, { user: serializeCurrentUser(user) });
    }
    const body = req.body as {
      username: string;
      displayName: string;
      avatar?: string;
      location?: string;
      favoriteGames?: string[];
      customGames?: string[];
      interests?: string[];
      socialLinks?: Record<string, string>;
      bio?: string;
    };

    const clash = await User.findOne({ username: body.username.toLowerCase(), _id: { $ne: user._id } });
    if (clash) throw AppError.conflict('USERNAME_TAKEN', 'That username is already taken.');

    if (body.favoriteGames?.length) {
      const valid = await Game.find({ _id: { $in: body.favoriteGames } }).select('_id');
      await User.updateOne(
        { _id: user._id },
        { $set: { favoriteGames: valid.map((g) => g._id) } },
      );
    }

    const updated = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          username: body.username.toLowerCase(),
          displayName: body.displayName.trim(),
          avatar: body.avatar || user.avatar || null,
          location: body.location || '',
          customGames: (body.customGames || []).slice(0, 8),
          interests: body.interests || [],
          bio: body.bio || '',
          socialLinks: (body.socialLinks || {}) as never,
          onboardingComplete: true,
        },
      },
      { new: true },
    );
    return ok(res, { user: updated ? serializeCurrentUser(updated) : null });
  }),
);

/** GET /api/auth/locations — broad area list (no GPS required). */
router.get('/locations', (_req, res) => ok(res, { areas: NIGERIAN_AREAS }));

/** GET /api/auth/config — which sign-in methods are live. */
router.get('/config', (_req, res) =>
  ok(res, {
    google: config.google.enabled,
    magicLink: true,
    payments: 'manual-bank-transfer',
    storage: config.cloudinary.enabled ? 'cloudinary' : 'local-dev',
  }),
);

export default router;
export { serializeCurrentUser };
