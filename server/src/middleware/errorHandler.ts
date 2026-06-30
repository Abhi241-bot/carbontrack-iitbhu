import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import multer from 'multer';
import { AppError } from '../utils/AppError';
import { sendError } from '../utils/response.utils';
import logger from '../utils/logger';

interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 'File too large — maximum 25 MB', 400);
    } else {
      sendError(res, err.message, 400);
    }
    return;
  }

  // Known application error
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.errors ?? []);
    return;
  }

  // Mongoose validation error
  if (err instanceof MongooseError.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    sendError(res, 'Validation failed', 400, errors);
    return;
  }

  // Mongoose bad ObjectId
  if (err instanceof MongooseError.CastError) {
    sendError(res, `Resource not found`, 404);
    return;
  }

  // MongoDB duplicate key
  const mongoErr = err as MongoServerError;
  if (mongoErr.code === 11000 && mongoErr.keyValue) {
    const field = Object.keys(mongoErr.keyValue)[0];
    sendError(res, `Duplicate value for field: ${field}`, 409);
    return;
  }

  // JWT errors
  if (err instanceof JsonWebTokenError || err instanceof TokenExpiredError) {
    sendError(res, 'Invalid or expired token', 401);
    return;
  }

  // Generic fallback
  if (process.env.NODE_ENV === 'production') {
    sendError(res, 'Internal server error', 500);
  } else {
    sendError(res, err.message || 'Internal server error', 500, [{ stack: err.stack }]);
  }
}
