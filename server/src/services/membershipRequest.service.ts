import mongoose from 'mongoose';
import {
  MembershipRequest,
  RequestStatus,
  RequestTargetType,
} from '../models/MembershipRequest.model';
import { Building } from '../models/Building.model';
import Campus from '../models/Campus.model';
import User from '../models/User.model';
import { AuditLog } from '../models/AuditLog.model';
import { AppError } from '../utils/AppError';
import { assignMember } from './building.service';
import { assignInfrastructureMember } from './campus.service';

export async function createRequest(userId: string, buildingId: string, message?: string) {
  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new AppError('Invalid building ID', 400);
  }

  const building = await Building.findOne({ _id: buildingId, isActive: true });
  if (!building) throw new AppError('Building not found', 404);

  // Check if user is already a member
  const alreadyMember = building.assignedMembers.some((m: any) => m.toString() === userId);
  if (alreadyMember) throw new AppError('You are already a member of this building', 400);

  // Check for existing pending request
  const existing = await MembershipRequest.findOne({
    userId,
    buildingId,
    targetType: RequestTargetType.BUILDING,
    status: RequestStatus.PENDING,
  });
  if (existing) throw new AppError('You already have a pending request for this building', 400);

  const request = await MembershipRequest.create({
    userId,
    buildingId,
    targetType: RequestTargetType.BUILDING,
    message,
  });
  return request;
}

export async function createCampusInfrastructureRequest(
  userId: string,
  campusId: string,
  message?: string
) {
  if (!mongoose.Types.ObjectId.isValid(campusId)) {
    throw new AppError('Invalid campus ID', 400);
  }

  const campus = await Campus.findOne({ _id: campusId, isActive: true });
  if (!campus) throw new AppError('Campus not found', 404);

  // Check if user is already assigned
  const alreadyAssigned = campus.infrastructureAssignedMembers.some((m: any) => m.toString() === userId);
  if (alreadyAssigned)
    throw new AppError('You are already assigned to this campus infrastructure', 400);

  // Check for existing pending request
  const existing = await MembershipRequest.findOne({
    userId,
    campusId,
    targetType: RequestTargetType.CAMPUS_INFRASTRUCTURE,
    status: RequestStatus.PENDING,
  });
  if (existing) throw new AppError('You already have a pending request for this campus', 400);

  const request = await MembershipRequest.create({
    userId,
    campusId,
    targetType: RequestTargetType.CAMPUS_INFRASTRUCTURE,
    message,
  });
  return request;
}

export async function listRequests(params: {
  status?: string;
  buildingId?: string;
  targetType?: string;
  page?: number;
  limit?: number;
}) {
  const { status, buildingId, targetType, page = 1, limit = 20 } = params;
  const query: Record<string, unknown> = {};

  if (status) query.status = status;
  if (buildingId) query.buildingId = buildingId;
  if (targetType) query.targetType = targetType;

  const skip = (Math.max(1, page) - 1) * Math.min(100, limit);

  const [requests, total] = await Promise.all([
    MembershipRequest.find(query)
      .populate('userId', 'name email department')
      .populate('buildingId', 'name shortName type')
      .populate('campusId', 'name slug institution')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, limit))
      .lean(),
    MembershipRequest.countDocuments(query),
  ]);

  return { requests, total };
}

export async function getUserRequests(userId: string) {
  const requests = await MembershipRequest.find({ userId })
    .populate('buildingId', 'name shortName type')
    .sort({ createdAt: -1 })
    .lean();
  return requests;
}

export async function approveRequest(requestId: string, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new AppError('Invalid request ID', 400);
  }

  const request = await MembershipRequest.findById(requestId);
  if (!request) throw new AppError('Request not found', 404);
  if (request.status !== RequestStatus.PENDING) {
    throw new AppError('Request has already been reviewed', 400);
  }

  request.status = RequestStatus.APPROVED;
  request.reviewedBy = new mongoose.Types.ObjectId(adminId);
  request.reviewedAt = new Date();
  await request.save();

  // Assign the user to the correct target
  if (request.targetType === RequestTargetType.CAMPUS_INFRASTRUCTURE && request.campusId) {
    const campus = await Campus.findById(request.campusId);
    if (!campus) throw new AppError('Campus not found', 404);
    await assignInfrastructureMember(campus.slug, request.userId.toString(), adminId);
  } else if (request.buildingId) {
    await assignMember(request.buildingId.toString(), request.userId.toString(), adminId);
  }

  await AuditLog.create({
    action: 'membership_request.approve',
    entityType: 'MembershipRequest',
    entityId: request._id,
    performedBy: adminId,
    changes: {
      userId: request.userId,
      targetType: request.targetType,
      buildingId: request.buildingId,
      campusId: request.campusId,
    },
  });

  return request;
}

export async function rejectRequest(requestId: string, adminId: string) {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new AppError('Invalid request ID', 400);
  }

  const request = await MembershipRequest.findById(requestId);
  if (!request) throw new AppError('Request not found', 404);
  if (request.status !== RequestStatus.PENDING) {
    throw new AppError('Request has already been reviewed', 400);
  }

  request.status = RequestStatus.REJECTED;
  request.reviewedBy = new mongoose.Types.ObjectId(adminId);
  request.reviewedAt = new Date();
  await request.save();

  await AuditLog.create({
    action: 'membership_request.reject',
    entityType: 'MembershipRequest',
    entityId: request._id,
    performedBy: adminId,
    changes: { userId: request.userId, buildingId: request.buildingId },
  });

  return request;
}

export async function getPendingCount() {
  return MembershipRequest.countDocuments({ status: RequestStatus.PENDING });
}
