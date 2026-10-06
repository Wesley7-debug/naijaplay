import { Router } from 'express';
import { z } from 'zod';
import { globalMessageSchema, guestNameSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { rateLimits } from '../middleware/security.js';
import { getGlobalHistory, mintGuest, postGlobalMessage } from '../services/global.service.js';
import { presenceForGlobal } from '../sockets/index.js';

const router = Router();

/** POST /api/global/guest — mint an anonymous identity (no auth needed). */
router.post(
  '/guest',
  handler(async (_req, res) => {
    return created(res, mintGuest());
  }),
);

/** GET /api/global/messages?cursor=&limit= — public lobby history. */
router.get(
  '/messages',
  handler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 50);
    const cursor = req.query.cursor ? new Date(Number(req.query.cursor)) : undefined;
    const items = await getGlobalHistory(limit, cursor && !Number.isNaN(cursor.getTime()) ? cursor : undefined);
    const docs = items;
    return ok(res, {
      items: docs,
      nextCursor: docs.length === limit ? String(new Date(docs[0].createdAt).getTime()) : null,
    });
  }),
);

/** POST /api/global/messages — public send (authed or guest). */
router.post(
  '/messages',
  optionalAuth,
  rateLimits.messages,
  validate(globalMessageSchema),
  handler(async (req, res) => {
    const body = req.body as { content: string; guestId?: string; guestName?: string };
    const message = await postGlobalMessage(
      {
        user: req.user || null,
        guestId: body.guestId || null,
        guestName: body.guestName || null,
      },
      body.content,
    );
    return created(res, { message });
  }),
);

/** PATCH /api/global/guest-name — validate a chosen guest display name. */
router.post(
  '/guest-name',
  validate(z.object({ guestName: guestNameSchema })),
  handler(async (req, res) => {
    const { guestName } = req.body as { guestName: string };
    return ok(res, { guestName: guestName.trim().slice(0, 20) });
  }),
);

/** GET /api/global/presence — who's in the lobby right now. */
router.get(
  '/presence',
  handler(async (_req, res) => {
    return ok(res, presenceForGlobal());
  }),
);

export default router;
