import nodemailer from 'nodemailer';
import config from '../config/env.js';
import logger from '../config/logger.js';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email sender with pluggable providers.
 * - "log": development provider — prints link to server logs (never pretends delivery).
 * - "gmail": real delivery via Gmail SMTP (needs an App Password, not your login password).
 * - "resend": uses Resend HTTP API when EMAIL_API_KEY set.
 * - "smtp-api": generic transactional API placeholder (SendGrid-compatible payload).
 */
export async function sendEmail(payload: EmailPayload): Promise<{ delivered: boolean; provider: string }> {
  const provider = config.email.provider || 'log';

  if (provider === 'gmail') {
    return sendViaGmail(payload);
  }

  // The log provider is dev-only: in prod it would leak sign-in links into
  // logs AND pretend delivery — fail honestly instead.
  if (config.isProd) {
    logger.error({ provider }, '[email] dev-only email provider in production — mail NOT sent');
    return { delivered: false, provider };
  }

  if (provider === 'log') {
    logger.info({ to: payload.to, subject: payload.subject }, '[email:log] message');
    // eslint-disable-next-line no-console
    console.log(`\n📧 [dev-email] To: ${payload.to}\n   Subject: ${payload.subject}\n   ${payload.text || ''}\n`);
    return { delivered: true, provider: 'log' };
  }

  if (provider === 'resend' && config.email.apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.email.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.email.from,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.error({ status: res.status, body }, 'email send failed');
        return { delivered: false, provider };
      }
      return { delivered: true, provider };
    } catch (err) {
      logger.error({ err }, 'email send failed');
      return { delivered: false, provider };
    }
  }

  logger.warn({ provider }, 'Unknown email provider; falling back to log');
  if (config.isProd) {
    return { delivered: false, provider };
  }
  // eslint-disable-next-line no-console
  console.log(`\n📧 [fallback-email] To: ${payload.to}\n   ${payload.text || ''}\n`);
  return { delivered: true, provider: 'log-fallback' };
}

let gmailTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

/**
 * Gmail SMTP via App Password.
 * Setup (2 minutes, do it once):
 *   1. Google Account → Security → 2-Step Verification ON.
 *   2. Security → App passwords → create one for "Mail" → copy the 16-letter code.
 *   3. .env: EMAIL_PROVIDER=gmail, EMAIL_GMAIL_USER=you@gmail.com,
 *      EMAIL_GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx, EMAIL_FROM="NaijaPlay <you@gmail.com>".
 */
async function sendViaGmail(payload: EmailPayload): Promise<{ delivered: boolean; provider: string }> {
  const { gmailUser, gmailPass } = config.email;
  if (!gmailUser || !gmailPass) {
    logger.error('[email:gmail] missing EMAIL_GMAIL_USER / EMAIL_GMAIL_APP_PASSWORD — mail NOT sent');
    return { delivered: false, provider: 'gmail' };
  }
  try {
    if (!gmailTransporter) {
      gmailTransporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailPass.replace(/\s+/g, '') },
        pool: true,
        maxConnections: 3,
      });
      await gmailTransporter.verify();
      logger.info('[email:gmail] SMTP ready');
    }
    await gmailTransporter.sendMail({
      from: config.email.from.includes('@') ? config.email.from : `NaijaPlay <${gmailUser}>`,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    return { delivered: true, provider: 'gmail' };
  } catch (err) {
    gmailTransporter = null;
    logger.error({ err }, '[email:gmail] send failed');
    return { delivered: false, provider: 'gmail' };
  }
}

export function magicLinkEmail(link: string): EmailPayload['html'] {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0B1220;color:#e8ecf5;border-radius:12px">
    <h2 style="color:#22c55e;margin-bottom:8px">NaijaPlay</h2>
    <p style="font-size:16px">Your people are already online. Tap below to sign in:</p>
    <a href="${link}" style="display:inline-block;background:#22c55e;color:#04110a;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Enter NaijaPlay</a>
    <p style="font-size:13px;color:#93a3b8">This link expires in 15 minutes and can only be used once.</p>
    <p style="font-size:13px;color:#93a3b8">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}

export function notificationEmail(title: string, body: string, link?: string): EmailPayload['html'] {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0B1220;color:#e8ecf5;border-radius:12px">
    <h2 style="color:#22c55e;margin-bottom:8px">NaijaPlay</h2>
    <h3 style="margin:0 0 8px">${title}</h3>
    <p style="font-size:15px">${body}</p>
    ${link ? `<a href="${link}" style="display:inline-block;background:#22c55e;color:#04110a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;margin:12px 0">Open</a>` : ''}
  </div>`;
}
