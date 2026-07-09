# Deploying CarbonTrack IITBHU to Vercel

This project deploys **frontend + backend** on the same Vercel URL using:
- **React/Vite** static frontend → served from `client/dist`
- **Express API** → served as a Vercel Serverless Function at `/api/*`

---

## 1. Import Project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** → connect your GitHub account
3. Select your repository
4. Vercel will auto-detect the `vercel.json`
5. Leave **Root Directory** as `.` (project root)
6. Click **Deploy**

---

## 2. Add Environment Variables in Vercel Dashboard

After the first deploy, go to:  
**Project Settings → Environment Variables**

Import your `.env.vercel` file or manually add:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | *Your MongoDB connection string* |
| `JWT_ACCESS_SECRET` | *Random secret string* |
| `JWT_REFRESH_SECRET` | *Random secret string* |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | *Your sender email address* |
| `EMAIL_PASS` | *Your email app password* |
| `EMAIL_FROM` | *Your sender email address* |
| `CLIENT_URL` | `https://your-app.vercel.app` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
| `ADMIN_DEFAULT_PASSWORD` | *Your default admin password* |
| `UPSTASH_REDIS_REST_URL` | *Your Upstash Redis URL* |
| `UPSTASH_REDIS_REST_TOKEN` | *Your Upstash Redis token* |

> After adding env vars, click **Redeploy** to apply them.

---

## 3. Allow All IPs in MongoDB Atlas

Vercel uses dynamic IPs, so you must allow all IPs:

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Network Access → Add IP Address**
3. Click **Allow Access from Anywhere** (`0.0.0.0/0`)
4. Confirm
