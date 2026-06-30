import { body } from 'express-validator';
import { ALLOWED_EMAIL_DOMAINS } from '@shared/constants/defaults';

export const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail()
    .custom((val: string) => {
      if (!ALLOWED_EMAIL_DOMAINS.some((d) => val.endsWith(d))) {
        throw new Error('Only IIT BHU email addresses are allowed (@itbhu.ac.in, @iitbhu.ac.in, @bhu.ac.in)');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('department').optional().trim(),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export const forgotPasswordValidator = [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
];

export const resetPasswordValidator = [
  body('token').notEmpty().withMessage('Token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
];

export const resendVerificationValidator = [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
];
