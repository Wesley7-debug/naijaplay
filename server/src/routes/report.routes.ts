import { Router } from 'express';
import { reportSchema } from '@naijaplay/shared';
import { handler, ok, created } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { rateLimits } from '../middleware/security.js';
import { createReport } from '../services/moderation.service.js';
import { AppError } from '../utils/errors.js';

const router = Router();

/** POST /api/reports — report user/message/room/event/giveaway/moment/crew. */
router.post(
  '/',
  requireAuth,
  rateLimits.reports,
  validate(reportSchema),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = req.body as { targetType: string; targetId: string; reason: string; description?: string };

    if (body.targetType === 'user' && body.targetId === String(user._id)) {
      throw AppError.badRequest('SELF_REPORT', 'You cannot report yourself.');
    }

    const report = await createReport({
      reporterId: String(user._id),
      targetType: body.targetType as never,
      targetId: body.targetId,
      reason: body.reason as never,
      description: body.description,
    });
    return created(res, { reportId: String(report._id), status: report.status, message: 'Report received. Our moderators will review it.' });
  }),
);

export default router;
