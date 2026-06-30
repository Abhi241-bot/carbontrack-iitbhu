import { Request, Response, NextFunction } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { sendSuccess } from '../utils/response.utils';

export async function getPublicStatsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const campusSlug = req.query.campusSlug as string | undefined;
    const stats = await dashboardService.getPublicStats(campusSlug);
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function getByTypeController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await dashboardService.getCampusByType();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getTopBuildingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const data = await dashboardService.getTopBuildings(limit);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getTimelineController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await dashboardService.getSubmissionTimeline();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getMyStatsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.userId) {
      sendSuccess(res, { buildings: [] });
      return;
    }
    const data = await dashboardService.getMyStats(req.user.userId);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
