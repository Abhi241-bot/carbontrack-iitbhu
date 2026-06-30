import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { IAuthTokenPayload } from '@shared/types/user.types';
import config from '../config/env';

export const generateAccessToken = (payload: IAuthTokenPayload): string =>
  jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn } as jwt.SignOptions);

export const generateRefreshToken = (payload: IAuthTokenPayload): string =>
  jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions);

export const verifyAccessToken = (token: string): IAuthTokenPayload =>
  jwt.verify(token, config.jwt.accessSecret) as IAuthTokenPayload;

export const verifyRefreshToken = (token: string): IAuthTokenPayload =>
  jwt.verify(token, config.jwt.refreshSecret) as IAuthTokenPayload;

// ALWAYS store the SHA-256 hash in DB, send the RAW token to the user.
// On verify: hash the incoming raw token and compare with stored hash.
export const generateSecureToken = (): string =>
  crypto.randomBytes(32).toString('hex');

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');
