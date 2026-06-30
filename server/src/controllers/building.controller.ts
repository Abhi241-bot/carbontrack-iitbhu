import { Request, Response, NextFunction } from 'express';
import * as buildingService from '../services/building.service';
import { getSectionSummary, getCarbonSummary } from '../services/submission.service';
import { sendSuccess, sendError, sendPaginated } from '../utils/response.utils';

export async function getAllBuildingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { type, status, search, page, limit, campusSlug, campusId } = req.query as Record<
      string,
      string
    >;
    const { buildings, total } = await buildingService.getAllBuildings(
      { type, status, search, campusSlug, campusId },
      { page: page ? parseInt(page) : 1, limit: limit ? parseInt(limit) : 20 }
    );
    sendPaginated(res, buildings, total, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  } catch (err) {
    next(err);
  }
}

export async function getBuildingByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const building = await buildingService.getBuildingById(req.params.id);
    sendSuccess(res, building);
  } catch (err) {
    next(err);
  }
}

export async function getBuildingStatsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await buildingService.getBuildingStats();
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function updateBuildingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const building = await buildingService.updateBuilding(
      req.params.id,
      req.body,
      req.user?.userId
    );
    sendSuccess(res, building);
  } catch (err) {
    next(err);
  }
}

export async function createBuildingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const building = await buildingService.createBuilding(req.body, req.user?.userId);
    sendSuccess(res, building, 'Building created', 201);
  } catch (err) {
    next(err);
  }
}

export async function deleteBuildingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const building = await buildingService.deleteBuilding(req.params.id, req.user?.userId);
    sendSuccess(res, building);
  } catch (err) {
    next(err);
  }
}

export async function assignMemberController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.body as { userId: string };
    const building = await buildingService.assignMember(req.params.id, userId, req.user?.userId);
    sendSuccess(res, building);
  } catch (err) {
    next(err);
  }
}

export async function getSectionSummaryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const requestingUserId = req.user?.userId;
    const summary = await getSectionSummary(id, requestingUserId);
    sendSuccess(res, summary, 'Section summary fetched');
  } catch (err) {
    if (err instanceof Error) {
      const code = (err as NodeJS.ErrnoException).code;
      sendError(res, err.message, code === '404' ? 404 : 500);
    } else {
      next(err);
    }
  }
}

export async function removeMemberController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const building = await buildingService.removeMember(
      req.params.id,
      req.params.userId,
      req.user?.userId
    );
    sendSuccess(res, building);
  } catch (err) {
    next(err);
  }
}

export async function getCarbonSummaryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await getCarbonSummary(req.params.id);
    sendSuccess(res, summary);
  } catch (err) {
    if (err instanceof Error) {
      const code = (err as NodeJS.ErrnoException).code;
      sendError(res, err.message, code === '404' ? 404 : 500);
    } else {
      next(err);
    }
  }
}
