import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// In Vercel serverless the default in-memory store doesn't share state
// across invocations and can crash cold-starts. We disable rate limiting
// in production serverless (Vercel sets VERCEL=1) and keep it for local dev.
const isVercel = Boolean(process.env.VERCEL);

/** No-op middleware used when rate limiting is disabled (e.g. Vercel serverless) */
const noopMiddleware = (_req: Request, _res: Response, next: NextFunction) => next();

export const authLimiter = isVercel
  ? noopMiddleware
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10,
      message: { success: false, message: 'Too many requests, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    });

export const apiLimiter = isVercel
  ? noopMiddleware
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { success: false, message: 'Too many requests, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
    });
