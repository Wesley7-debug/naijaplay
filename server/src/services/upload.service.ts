import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import config from '../config/env.js';
import { AppError } from '../utils/errors.js';
import logger from '../config/logger.js';

/** Strict allowlists — never accept executables or unknown types. */
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;
export const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.mp4', '.webm', '.mov'] as const;
const BLOCKED_EXTENSIONS = ['.exe', '.sh', '.bat', '.cmd', '.js', '.html', '.php', '.dll', '.msi', '.scr', '.jar'];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // 60MB
export const MAX_VIDEO_DURATION_SEC = 120; // 2 minutes for clips

export interface UploadResult {
  url: string;
  width?: number;
  height?: number;
  durationSec?: number;
  provider: 'cloudinary' | 'local';
}

function validateFile(file: { originalname: string; mimetype: string; size: number }): 'image' | 'video' {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    throw AppError.badRequest('FILE_TYPE_BLOCKED', 'That file type is not allowed.');
  }
  const isImage = (ALLOWED_IMAGE_MIME as readonly string[]).includes(file.mimetype);
  const isVideo = (ALLOWED_VIDEO_MIME as readonly string[]).includes(file.mimetype);
  if (!isImage && !isVideo) {
    throw AppError.badRequest('FILE_TYPE_INVALID', 'Only images (jpg, png, webp, gif) and short videos (mp4, webm) are allowed.');
  }
  if (isImage) {
    if (file.size > MAX_IMAGE_BYTES) throw AppError.badRequest('FILE_TOO_LARGE', 'Images must be under 8MB.');
    return 'image';
  }
  if (file.size > MAX_VIDEO_BYTES) throw AppError.badRequest('FILE_TOO_LARGE', 'Videos must be under 60MB.');
  return 'video';
}

function localUploadDir(): string {
  const dir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function cloudinaryUpload(buffer: Buffer, folder: string, kind: 'image' | 'video'): Promise<UploadResult> {
  const timestamp = Math.round(Date.now() / 1000);
  const folderPath = `naijaplay/${folder}`;
  const toSign = `folder=${folderPath}&timestamp=${timestamp}${config.cloudinary.apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), `upload_${Date.now()}`);
  form.append('api_key', config.cloudinary.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folderPath);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  const body = (await res.json()) as {
    secure_url?: string;
    width?: number;
    height?: number;
    duration?: number;
    error?: { message?: string };
  };
  if (!res.ok || !body.secure_url) {
    logger.error({ body }, 'cloudinary upload failed');
    throw AppError.internal('Upload failed.');
  }
  return {
    url: body.secure_url,
    width: body.width,
    height: body.height,
    durationSec: body.duration,
    provider: 'cloudinary',
  };
}

/**
 * Server-side upload with MIME/size/extension validation.
 * Uses Cloudinary when configured, otherwise local disk in development
 * (clearly marked; production requires Cloudinary).
 */
export async function storeUpload(file: { buffer: Buffer; originalname: string; mimetype: string; size: number }, folder = 'misc'): Promise<UploadResult> {
  const kind = validateFile(file);
  if (config.cloudinary.enabled) {
    return cloudinaryUpload(file.buffer, folder, kind);
  }
  if (config.isProd) {
    throw AppError.internal('Object storage is not configured.');
  }
  const ext = path.extname(file.originalname || '').toLowerCase();
  const safeExt = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? ext : kind === 'image' ? '.png' : '.mp4';
  const name = `${crypto.randomBytes(16).toString('hex')}${safeExt}`;
  const dir = localUploadDir();
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return { url: `/uploads/${name}`, provider: 'local' };
}

/** Signature for direct-to-Cloudinary uploads from the browser. */
export function signedUploadParams(folder = 'moments'): Record<string, string | number> | null {
  if (!config.cloudinary.enabled) return null;
  const timestamp = Math.round(Date.now() / 1000);
  const folderPath = `naijaplay/${folder}`;
  const toSign = `folder=${folderPath}&timestamp=${timestamp}${config.cloudinary.apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  return {
    timestamp,
    folder: folderPath,
    signature,
    api_key: config.cloudinary.apiKey,
    cloudName: config.cloudinary.cloudName,
  };
}
