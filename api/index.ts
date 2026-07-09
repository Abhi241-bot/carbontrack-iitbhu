import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';

// ── Lazy-import the Express app so Vercel only loads it once per cold-start ──
// We CANNOT call `server.listen()` in serverless — Vercel manages the HTTP
// server. Instead we export the Express `app` as a handler.

// ------------------------------------------------------------------
// 1. MongoDB connection caching
//    Vercel Node.js functions keep the global scope alive between requests
//    in the same container ("warm" invocations). We cache the connection
//    promise so we don't open a new socket on every request.
// ------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var _mongoConnectionPromise: Promise<typeof mongoose> | undefined;
}

async function connectIfNeeded(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    // Already connected — nothing to do
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  if (!global._mongoConnectionPromise) {
    global._mongoConnectionPromise = mongoose.connect(uri, {
      // Recommended settings for serverless to avoid stale connections
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });
  }

  await global._mongoConnectionPromise;
}

// ------------------------------------------------------------------
// 2. Import the Express app
//    `app.ts` is a pure Express app — no listen() call inside it.
// ------------------------------------------------------------------
// We use require() so that the module is loaded after env vars are set
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: app } = require('../server/src/app');

// ------------------------------------------------------------------
// 3. Vercel handler — called on every HTTP request
// ------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await connectIfNeeded();
  } catch (err) {
    console.error('[Vercel] MongoDB connection failed:', err);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
    return;
  }

  // Delegate to Express
  return new Promise<void>((resolve) => {
    // @ts-ignore — VercelRequest is compatible with Express IncomingMessage
    app(req, res, () => resolve());
    res.on('finish', resolve);
  });
}
