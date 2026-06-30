import User, { IUserDocument } from '../models/User.model';
import { AppError } from '../utils/AppError';
import {
  generateAccessToken,
  generateRefreshToken,
  generateSecureToken,
  hashToken,
  verifyRefreshToken,
} from '../utils/jwt.utils';
import { sendPasswordResetEmail } from './email.service';
import { IUser } from '@shared/types/user.types';

function sanitizeUser(user: IUserDocument): IUser {
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    employeeId: user.employeeId,
    isEmailVerified: user.isEmailVerified,
    assignedBuildings: user.assignedBuildings.map(String),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function register(data: {
  name: string;
  email: string;
  password: string;
  department?: string;
}) {
  const existing = await User.findOne({ email: data.email });
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }

  const user = new User({
    name: data.name,
    email: data.email,
    password: data.password,
    department: data.department,
    isEmailVerified: true, // skip email verification for now
  });

  await user.save();

  return sanitizeUser(user);
}

export async function verifyEmail(rawToken: string) {
  const hashed = hashToken(rawToken);
  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    throw new AppError('Invalid or expired verification link', 400);
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
}

export async function resendVerification(_email: string) {
  // no-op while email verification is disabled
}

export async function login(email: string, password: string) {
  const user = await User.findByEmail(email);

  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) {
    throw new AppError('Invalid credentials', 401);
  }

  const payload = { userId: String(user._id), email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  user.refreshTokens.push({ token: refreshToken, createdAt: new Date() });
  if (user.refreshTokens.length > 5) {
    user.refreshTokens.shift();
  }
  user.lastLogin = new Date();
  await user.save();

  return { user: sanitizeUser(user), accessToken, refreshToken };
}

export async function refreshTokens(incomingRefreshToken: string) {
  const payload = verifyRefreshToken(incomingRefreshToken);

  const user = await User.findById(payload.userId).select('+refreshTokens');
  if (!user) {
    throw new AppError('User not found', 401);
  }

  const tokenExists = user.refreshTokens.some((rt) => rt.token === incomingRefreshToken);
  if (!tokenExists) {
    throw new AppError('Refresh token is invalid or has been revoked', 401);
  }

  const newPayload = { userId: String(user._id), email: user.email, role: user.role };
  const newAccessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);

  // Remove old token, push new one
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== incomingRefreshToken);
  user.refreshTokens.push({ token: newRefreshToken, createdAt: new Date() });
  if (user.refreshTokens.length > 5) {
    user.refreshTokens.shift();
  }
  await user.save();

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string, refreshToken: string) {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== refreshToken);
  await user.save();
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ email });
  if (!user) return; // silent — prevents user enumeration

  const rawToken = generateSecureToken();
  user.passwordResetToken = hashToken(rawToken);
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  sendPasswordResetEmail(user.email, user.name, rawToken);
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const hashed = hashToken(rawToken);
  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

  if (!user) {
    throw new AppError('Invalid or expired reset link', 400);
  }

  user.password = newPassword; // pre-save hook will hash it
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // invalidate all sessions
  await user.save();
}

export async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return sanitizeUser(user);
}
