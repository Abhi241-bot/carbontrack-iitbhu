import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response.utils';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,          // required when sameSite is 'none'
  sameSite: 'none' as const, // cross-origin: frontend/backend on different subdomains
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.register(req.body);
    sendSuccess(res, {}, 'Registration successful. Please check your email to verify your account.', 201);
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;
    if (!token) {
      sendError(res, 'Token is required', 400);
      return;
    }
    await authService.verifyEmail(token);
    sendSuccess(res, {}, 'Email verified successfully');
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.resendVerification(req.body.email);
    sendSuccess(res, {}, 'If that email is registered and unverified, a new link has been sent.');
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.login(email, password);
    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    sendSuccess(res, { user, accessToken }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const incomingToken = req.cookies?.refreshToken;
    if (!incomingToken) {
      sendError(res, 'Refresh token not found', 401);
      return;
    }
    const { accessToken, refreshToken: newRefreshToken } = await authService.refreshTokens(incomingToken);
    res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
    sendSuccess(res, { accessToken }, 'Token refreshed');
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const incomingToken = req.cookies?.refreshToken;
    if (incomingToken && req.user) {
      await authService.logout(req.user.userId, incomingToken);
    }
    res.clearCookie('refreshToken', { path: '/api/auth' });
    sendSuccess(res, {}, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.forgotPassword(req.body.email);
    sendSuccess(res, {}, 'If that email address is registered, you will receive a reset link shortly.');
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    sendSuccess(res, {}, 'Password reset successfully. Please log in with your new password.');
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await authService.getMe(req.user!.userId);
    sendSuccess(res, user, 'User retrieved');
  } catch (err) {
    next(err);
  }
}
