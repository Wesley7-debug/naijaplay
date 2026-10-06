import { Router } from 'express';
import multer from 'multer';
import { handler, ok, created } from '../utils/http.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import { rateLimits } from '../middleware/security.js';
import { storeUpload, signedUploadParams, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '../services/upload.service.js';
import { AppError } from '../utils/errors.js';
import config from '../config/env.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
});

/** POST /api/uploads — server-validated file upload (MIME/size/extension checks). */
router.post(
  '/',
  requireAuth,
  rateLimits.uploads,
  upload.single('file'),
  handler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('NO_FILE', 'No file received.');
    const folder = String(req.body?.folder || 'misc');
    if (!/^[a-z-]{3,20}$/.test(folder)) throw AppError.badRequest('BAD_FOLDER', 'Invalid upload folder.');
    const result = await storeUpload(req.file, folder);
    return created(res, { ...result, maxImageBytes: MAX_IMAGE_BYTES, maxVideoBytes: MAX_VIDEO_BYTES });
  }),
);

/** GET /api/uploads/sign — direct-to-Cloudinary signed params (when configured). */
router.get(
  '/sign',
  requireAuth,
  (_req, res) => {
    const params = signedUploadParams('moments');
    if (!params) {
      // Local dev storage: tell the client to upload through POST /api/uploads.
      return ok(res, { mode: 'server', uploadUrl: '/api/uploads', storage: 'local-dev' });
    }
    return ok(res, { mode: 'direct', storage: 'cloudinary', params, uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/auto/upload` });
  },
);

export default router;
