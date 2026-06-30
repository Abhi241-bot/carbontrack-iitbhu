import { Request, Response, NextFunction } from 'express';
import * as requestService from '../services/membershipRequest.service';
import { sendSuccess, sendPaginated } from '../utils/response.utils';

export async function createCampusRequestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { campusId, message } = req.body as { campusId: string; message?: string };
    const request = await requestService.createCampusInfrastructureRequest(
      req.user!.userId,
      campusId,
      message
    );
    sendSuccess(res, request, 'Campus infrastructure access request submitted', 201);
  } catch (err) {
    next(err);
  }
}

export async function createRequestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId, message } = req.body as { buildingId: string; message?: string };
    const request = await requestService.createRequest(req.user!.userId, buildingId, message);
    sendSuccess(res, request, 'Membership request submitted', 201);
  } catch (err) {
    next(err);
  }
}

export async function getUserRequestsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requests = await requestService.getUserRequests(req.user!.userId);
    sendSuccess(res, requests);
  } catch (err) {
    next(err);
  }
}

export async function listRequestsAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, buildingId, targetType, page, limit } = req.query as Record<string, string>;
    const { requests, total } = await requestService.listRequests({
      status,
      buildingId,
      targetType,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    sendPaginated(res, requests, total, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  } catch (err) {
    next(err);
  }
}

export async function approveRequestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const request = await requestService.approveRequest(req.params.id, req.user!.userId);
    sendSuccess(res, request);
  } catch (err) {
    next(err);
  }
}

export async function rejectRequestController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const request = await requestService.rejectRequest(req.params.id, req.user!.userId);
    sendSuccess(res, request);
  } catch (err) {
    next(err);
  }
}
