import { Router } from 'express';
import { handler, ok } from '../utils/http.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { listNotifications, unreadCount, markRead, markAllRead } from '../services/notification.service.js';

const router = Router();

/** GET /api/notifications?cursor= */
router.get(
  '/',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
    const [feed, unread] = await Promise.all([listNotifications(String(user._id), cursor), unreadCount(String(user._id))]);
    return ok(res, { ...feed, unread });
  }),
);

/** GET /api/notifications/unread-count */
router.get(
  '/unread-count',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    return ok(res, { unread: await unreadCount(String(user._id)) });
  }),
);

/** POST /api/notifications/read — mark specific ids read. */
router.post(
  '/read',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    const ids = ((req.body as { ids?: string[] })?.ids || []).filter(Boolean).slice(0, 100);
    await markRead(String(user._id), ids.length ? ids : undefined);
    return ok(res, { unread: await unreadCount(String(user._id)) });
  }),
);

/** POST /api/notifications/read-all */
router.post(
  '/read-all',
  requireAuth,
  handler(async (req, res) => {
    const user = currentUser(req);
    await markAllRead(String(user._id));
    return ok(res, { unread: 0 });
  }),
);

export default router;
