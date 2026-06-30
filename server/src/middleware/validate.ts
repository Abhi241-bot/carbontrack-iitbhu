import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { sendError } from '../utils/response.utils';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    sendError(
      res,
      'Validation failed',
      400,
      errors
        .array()
        .map((e) => ({ field: e.type === 'field' ? e.path : undefined, message: e.msg }))
    );
    return;
  }

  next();
}
