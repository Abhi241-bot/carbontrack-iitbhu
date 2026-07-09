# Deploying CarbonTrack IITBHU to Vercel

This project deploys **frontend + backend** on the same Vercel URL using:
- **React/Vite** static frontend → served from `client/dist`
- **Express API** → served as a Vercel Serverless Function at `/api/*`

---

## 1. Push to GitHub

Make sure all changes are pushed to `main`:

```bash
git push origin main
```

---

## 2. Import Project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** → connect your GitHub account
3. Select `Abhi241-bot/carbontrack-iitbhu`
4. Vercel will auto-detect the `vercel.json` — **do NOT change the framework preset**
5. Leave **Root Directory** as `.` (project root)
6. Click **Deploy** — Vercel will use `npm run vercel-build` as the build command

---

## 3. Add Environment Variables in Vercel Dashboard

After the first deploy, go to:  
**Project Settings → Environment Variables**

Add the following for **Production** (and optionally Preview):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `mongodb+srv://abhiram04122006:Abhi%402006@cluster0.zp8imi8.mongodb.net/carbon-portal?retryWrites=true&w=majority` |
| `JWT_ACCESS_SECRET` | A long random string (e.g., `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | A different long random string |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | `abhiram04122006@gmail.com` |
| `EMAIL_PASS` | `husr obyf ppsp vvlu` |
| `EMAIL_FROM` | `abhiram04122006@gmail.com` |
| `CLIENT_URL` | `https://carbontrack-iitbhu.vercel.app` |
| `ALLOWED_ORIGINS` | `https://carbontrack-iitbhu.vercel.app` |
| `ADMIN_DEFAULT_PASSWORD` | `ChangeMe123!` |
| `UPSTASH_REDIS_REST_URL` | `https://placeholder.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | `placeholder_token` |

> After adding env vars, click **Redeploy** to apply them.

---

## 4. Allow All IPs in MongoDB Atlas

Vercel uses dynamic IPs, so you must allow all IPs:

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Network Access → Add IP Address**
3. Click **Allow Access from Anywhere** (`0.0.0.0/0`)
4. Confirm

---

## 5. Your Live URLs

| What | URL |
|------|-----|
| Frontend | `https://carbontrack-iitbhu.vercel.app` |
| API | `https://carbontrack-iitbhu.vercel.app/api` |
| Health check | `https://carbontrack-iitbhu.vercel.app/api/health` |

---

## Local Development (unchanged)

```bash
npm run dev        # starts both server (port 5000) and client (port 5173)
```

The Vite dev server proxies `/api/*` to `http://localhost:5000` automatically.
