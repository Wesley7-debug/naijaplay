# Publishing NaijaPlay

Live frontend: **https://naijaplay-one.vercel.app** (Vercel, Root Directory `client`).

## Where each piece lives

| Piece | Host | Notes |
|---|---|---|
| Frontend | Vercel (`naijaplay-one.vercel.app`) | Static Vite build, Root Directory `client` |
| Backend | Render / Railway / Fly (persistent Node process) | **Not Vercel serverless** — see why below |
| Database | MongoDB Atlas | Allowlist the backend host (or `0.0.0.0/0` while testing) |
| Media | Cloudinary (prod) | Local disk only works in dev |
| Email | Gmail SMTP (App Password) | Required in prod for magic links |

### Why the backend doesn't go on Vercel serverless

The backend is a long-lived process: Socket.IO rooms/presence, `setInterval` jobs (giveaways, reminders, recaps, seasons), and in-memory rate limits. Vercel Functions freeze between requests, so realtime chat, presence, and scheduled jobs break there (HTTP routes would work; everything live would not). The pinned dependency tree means the build passes anywhere — but run it somewhere persistent.

## Backend on Render (recommended, ~5 min)

1. New → Web Service → connect repo → Runtime Node 20+
2. Leave **Root Directory empty** (the backend needs `../shared` — isolating `server/` breaks the build).
3. Build command: `npm ci && npm run build` (builds `shared` → `server` → `client` in order, using the committed lockfile)
4. Start command: `npm run start -w server`
5. Health check path: `/api/health`
5. Env vars (production):

```env
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/naijaplay
SESSION_SECRET=<fresh long random, different from dev>
CLIENT_URL=https://naijaplay-one.vercel.app
SERVER_URL=https://<your-backend>.onrender.com
RATE_LIMIT_TRUST_PROXY=1
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_PROVIDER=gmail
EMAIL_GMAIL_USER=you@gmail.com
EMAIL_GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
EMAIL_FROM="NaijaPlay <you@gmail.com>"
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
LOG_LEVEL=info
```

6. Never run `npm run seed` against prod. Never reuse the dev `SESSION_SECRET`.

## Email deliverability (Gmail lands in spam at first)

Real sends work, but **first-time senders usually land in spam** until recipients mark you "Not spam" — the sign-in screen already tells users to check spam, keep that copy. To improve inbox placement:

- Send from one consistent address (`EMAIL_FROM` matches `EMAIL_GMAIL_USER`).
- Ask early users to move the first email out of spam / add the address to contacts.
- Long-term fix once you own a domain: send from it (Google Workspace or Resend with SPF + DKIM + DMARC DNS records) instead of `@gmail.com`.

## Wiring the Vercel frontend to the backend

`client/vercel.json` already rewrites `/api/*`, `/socket.io/*`, and `/uploads/*` to the backend. After the backend is live, replace `YOUR-BACKEND-HOST` in that file with your Render host (or set it per-environment) and redeploy the frontend.

Vercel dashboard env for the frontend project:

```env
VITE_API_URL=https://<your-backend>.onrender.com
VITE_APP_URL=https://naijaplay-one.vercel.app
```

### Cookie note for split origins

Session auth is cookie-based. Same-origin (single-service or Vercel rewrites) just works. If you ever serve the app and API on *different subdomains* of one parent (e.g. `app.naijaplay.com` + `api.naijaplay.com`), set `COOKIE_DOMAIN=.naijaplay.com` on the backend so both hosts share the session. Totally separate domains cannot share cookies — use single-service in that case (`SERVE_CLIENT=1`, serves `client/dist` from the API origin).

## Google OAuth URIs

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client, keep **both** dev and prod entries:

| | Dev | Prod |
|---|---|---|
| JavaScript origin | `http://localhost:5173` | `https://naijaplay-one.vercel.app` |
| Redirect URI | `http://localhost:4000/api/auth/google/callback` | `https://<your-backend>.onrender.com/api/auth/google/callback` |

## Deterministic builds

All workspace deps are exact-pinned to the versions in `package-lock.json` (which is committed). Vercel/Render installs therefore resolve the identical tree that passed locally — this fixed a real incident where a fresh install pulled newer `helmet`/`express-rate-limit` types and failed `tsc`. Use `npm ci` in CI/deploy pipelines, never bare `npm install`.

## Pre-launch checklist

- [ ] Atlas: prod database user (not the dev one), IP rules tightened
- [ ] `SESSION_SECRET` fresh + unique to prod
- [ ] Google redirect URI for the prod backend added (dev URI kept)
- [ ] Cloudinary set (upload a Moment to confirm)
- [ ] Gmail: send yourself a magic link, confirm delivery + 15-min expiry
- [ ] `/api/health` returns `{"status":"ok","env":"production"}`
- [ ] Guest global chat + @mention notification round-trip
- [ ] Giveaway end-to-end on a test room (server draw + winner notice)
- [ ] Recap page renders after ending a test room (`/recaps/:id`)
