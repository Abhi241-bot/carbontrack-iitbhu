# IIT BHU Carbon Portal

A full-stack web application for tracking and managing carbon emissions across IIT BHU campus buildings.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v3, Zustand, React Query v5, React Hook Form, Zod |
| Backend | Node.js, Express 4, TypeScript, Mongoose 8, JWT, bcryptjs, Nodemailer |
| Database | MongoDB |
| Cache/Session | Redis |
| Shared | Monorepo workspace (`shared/` package with types + constants) |

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **MongoDB** running locally (default: `mongodb://localhost:27017`) or a MongoDB Atlas URI
- **Redis** running locally (default: `redis://localhost:6379`)
- An SMTP account for sending email (Gmail with App Password, Mailtrap, etc.)

---

## Project Structure

```
carbontrack-iitbhu/
├── client/          # React + Vite frontend
├── server/          # Express backend
├── shared/          # Shared TypeScript types & constants
└── package.json     # Root workspace
```

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd carbontrack-iitbhu
npm install          # installs all workspaces (client, server, shared)
```

### 2. Configure environment variables

**Server** — copy and edit:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/carbon-portal
REDIS_URL=redis://localhost:6379

# Generate strong secrets (e.g., openssl rand -hex 64)
JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# SMTP — use Mailtrap for dev, Gmail App Password for staging
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=noreply@iitbhu.ac.in

CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
ADMIN_DEFAULT_PASSWORD=ChangeMe123!
```

> **Tip for local email testing:** Use [Mailtrap](https://mailtrap.io) (free) or [Ethereal](https://ethereal.email). Set `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS` from your Mailtrap inbox credentials.

**Client** — copy and edit:

```bash
cp client/.env.example client/.env
```

`client/.env` (defaults work for local dev):

```env
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=IIT BHU Carbon Portal
```

### 3. Start MongoDB and Redis

```bash
# macOS with Homebrew
brew services start mongodb-community
brew services start redis

# Or with Docker
docker run -d -p 27017:27017 --name mongo mongo:7
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

---

## Running Locally

### Development (both client and server with hot-reload)

From the project root:

```bash
npm run dev
```

This starts:
- **Server** on `http://localhost:5000` (ts-node-dev)
- **Client** on `http://localhost:5173` (Vite)

### Run individually

```bash
# Server only
cd server && npm run dev

# Client only
cd client && npm run dev

# Shared types (if you change shared/)
cd shared && npx tsc
```

---

## Building for Production

```bash
# From root
npm run build

# Or individually
cd shared && npx tsc
cd server && npm run build   # outputs to server/dist/
cd client && npm run build   # outputs to client/dist/
```

Run the compiled server:

```bash
NODE_ENV=production node server/dist/server.js
```

---

## Seed Data (Optional)

Populate emission factors and sample buildings:

```bash
cd server && npm run seed
```

---

## Authentication Flow

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/register` | POST | — | Register with IIT BHU email |
| `/api/auth/verify-email` | POST | — | Verify email via token |
| `/api/auth/resend-verification` | POST | — | Resend verification email |
| `/api/auth/login` | POST | — | Login → access token (body) + refresh token (httpOnly cookie) |
| `/api/auth/refresh-token` | POST | cookie | Rotate tokens |
| `/api/auth/logout` | POST | Bearer | Invalidate refresh token |
| `/api/auth/forgot-password` | POST | — | Send password reset email |
| `/api/auth/reset-password` | POST | — | Reset password with token |
| `/api/auth/me` | GET | Bearer | Get current user |

**Token strategy:**
- Access token: 15-minute JWT, stored in Zustand (in-memory)
- Refresh token: 7-day JWT, stored in `httpOnly` cookie (`path: /api/auth`)
- Max 5 concurrent refresh tokens per user (oldest evicted)
- Password reset invalidates all sessions

**Allowed email domains:** `@itbhu.ac.in`, `@iitbhu.ac.in`, `@bhu.ac.in`

---

## Frontend Routes

| Path | Access | Description |
|------|--------|-------------|
| `/` | Public | Landing page |
| `/login` | Public | Login |
| `/register` | Public | Register |
| `/forgot-password` | Public | Forgot password |
| `/verify-email/:token` | Public | Email verification |
| `/reset-password/:token` | Public | Password reset |
| `/dashboard` | Authenticated | Dashboard |
| `/buildings` | Authenticated | Buildings list |
| `/buildings/:id` | Authenticated | Building detail |
| `/buildings/:id/submit` | MEMBER/REVIEWER/ADMIN | Data entry wizard |
| `/buildings/:id/results` | Authenticated | Carbon results |
| `/admin` | ADMIN only | Admin panel |

---

## User Roles

| Role | Description |
|------|-------------|
| `member` | Default role for new registrations |
| `viewer` | Read-only public access concept |
| `reviewer` | Can review and verify submissions |
| `admin` | Full access including admin panel |

---

## API Response Format

All API responses follow:

```json
{ "success": true, "message": "...", "data": { ... } }
```

Errors:

```json
{ "success": false, "message": "...", "errors": [] }
```

---

## Manual Verification Checklist

1. `POST /api/auth/register` with `@gmail.com` → 400 domain restriction
2. `POST /api/auth/register` with `@itbhu.ac.in` → 201
3. `POST /api/auth/register` same email again → 409
4. `POST /api/auth/login` before verification → 403
5. Set `isEmailVerified: true` in MongoDB, then login → 200 + cookie
6. `GET /api/auth/me` with Bearer token → user data
7. `GET /api/auth/me` with no token → 401
8. `POST /api/auth/refresh-token` (with cookie) → new tokens
9. `POST /api/auth/logout` → cookie cleared
10. Frontend register shows domain helper text
11. Password strength indicator updates in real-time
12. Login page shows "Registration successful" banner after redirect from `/register`
13. Email verification page shows correct state on mount
14. Axios interceptor retries after token refresh (expire token manually, make call)
15. `npm run build` passes with zero TypeScript errors

---

## Development Notes

- **TypeScript path aliases**: `@/*` maps to `client/src/*`, `@shared/*` maps to `shared/src/*`
- **Rate limiting**: Auth endpoints are limited to 10 req/15 min per IP
- **CORS**: Configured via `ALLOWED_ORIGINS` env var (comma-separated)
- **Cookies**: Refresh token cookie is `httpOnly`, `sameSite: strict`, scoped to `/api/auth`
- **Passwords**: Hashed with bcrypt (12 rounds) in Mongoose pre-save hook
- **Token hashing**: Email verification and password reset tokens are SHA-256 hashed before DB storage
