import { Request, Response, NextFunction } from 'express';
import * as adminService from '../services/admin.service';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.utils';
import { UserRole } from '@shared/types/user.types';
import { Building } from '../models/Building.model';
import { Campus } from '../models/Campus.model';
import { Submission } from '../models/Submission.model';

export async function getStatsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await adminService.getAdminStats();
    sendSuccess(res, stats);
  } catch (err) {
    next(err);
  }
}

export async function listUsersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, role, page, limit } = req.query as Record<string, string>;
    const { users, total } = await adminService.listUsers({
      search,
      role,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    sendPaginated(res, users, total, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  } catch (err) {
    next(err);
  }
}

export async function changeUserRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { role } = req.body as { role: UserRole };
    const user = await adminService.changeUserRole(req.params.id, role, req.user!.userId);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit } = req.query as Record<string, string>;
    const { logs, total } = await adminService.getAuditLogs({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    sendPaginated(res, logs, total, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  } catch (err) {
    next(err);
  }
}

export async function getEmissionFactorsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const factors = await adminService.getAllEmissionFactors();
    sendSuccess(res, factors);
  } catch (err) {
    next(err);
  }
}

export async function updateEmissionFactorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { value } = req.body as { value: number };
    const factor = await adminService.updateEmissionFactorValue(
      req.params.id,
      value,
      req.user!.userId
    );
    sendSuccess(res, factor);
  } catch (err) {
    next(err);
  }
}

export async function recalculateSubmissionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const carbonResults = await adminService.recalculateVerifiedSubmission(
      req.params.submissionId,
      req.user!.userId
    );
    sendSuccess(res, { carbonResults });
  } catch (err) {
    next(err);
  }
}

export async function createEmissionFactorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category, name, value, unit, scope, source, year, region, subcategory } = req.body as {
      category: string;
      name: string;
      value: number;
      unit: string;
      scope: string;
      source?: string;
      year?: number;
      region?: string;
      subcategory?: string;
    };

    if (!category || !name || value === undefined || !unit || !scope) {
      res
        .status(400)
        .json({ success: false, message: 'category, name, value, unit, and scope are required' });
      return;
    }

    const factor = await adminService.createEmissionFactor(
      { category, name, value, unit, scope, source, year, region, subcategory },
      req.user!.userId
    );
    res.status(201).json({ success: true, data: factor });
  } catch (err) {
    next(err);
  }
}

export async function deleteEmissionFactorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const factor = await adminService.softDeleteEmissionFactor(req.params.id, req.user!.userId);
    sendSuccess(res, factor);
  } catch (err) {
    next(err);
  }
}

export async function setDefaultEmissionFactorController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const factor = await adminService.setDefaultEmissionFactor(req.params.id, req.user!.userId);
    sendSuccess(res, factor);
  } catch (err) {
    next(err);
  }
}

export async function listSubmissionsAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, section, page, limit } = req.query as Record<string, string>;
    const { submissions, total } = await adminService.listSubmissionsAdmin({
      status,
      section,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
    sendPaginated(res, submissions, total, page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  } catch (err) {
    next(err);
  }
}

export async function approveSubmissionAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const submission = await adminService.approveSubmissionAdmin(req.params.id, req.user!.userId);
    sendSuccess(res, submission);
  } catch (err) {
    next(err);
  }
}

export async function requestRevisionAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { notes } = req.body as { notes: string };
    const submission = await adminService.requestRevisionAdmin(
      req.params.id,
      req.user!.userId,
      notes ?? ''
    );
    sendSuccess(res, submission);
  } catch (err) {
    next(err);
  }
}

// ── Campus-scoped controllers ─────────────────────────────────────────────────

export const verifyCampusAccess = async (
  _req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  // All admins have full access to all campuses in the current role system
  next();
};

export const getCampusList = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const campuses = await Campus.find({ isActive: true }).lean();

    const campusesWithStats = await Promise.all(
      campuses.map(async (c) => {
        const buildingCount = await Building.countDocuments({ campusId: c._id });
        const buildingIds = await Building.find({ campusId: c._id }).distinct('_id');
        const pendingCount = await Submission.countDocuments({
          buildingId: { $in: buildingIds },
          status: 'submitted',
        });
        return { ...c, buildingCount, pendingCount };
      })
    );

    sendSuccess(res, { campuses: campusesWithStats });
  } catch (err) {
    next(err);
  }
};

export const getCampusDetail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const campus = await Campus.findById(req.params.campusId).lean();
    if (!campus) {
      sendError(res, 'Campus not found', 404);
      return;
    }
    sendSuccess(res, { campus });
  } catch (err) {
    next(err);
  }
};

export const getCampusBuildings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { campusId } = req.params;
    const { search, page = '1', limit = '50' } = req.query as Record<string, string>;

    const query: Record<string, unknown> = { campusId };
    if (search) query.name = { $regex: search, $options: 'i' };

    const [buildings, total] = await Promise.all([
      Building.find(query)
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .populate('campusId', 'name slug')
        .lean(),
      Building.countDocuments(query),
    ]);

    const result = await Promise.all(
      buildings.map(async (b) => {
        const submissions = await Submission.find({ buildingId: b._id })
          .select(
            'section status version submittedAt carbonResults.operationalCarbonPerYear carbonResults.wasteCarbonPerYear'
          )
          .lean();

        const matrix: Record<string, unknown> = {};
        for (const section of ['overview', 'civil', 'electrical', 'waste']) {
          const subs = submissions
            .filter((s) => s.section === section)
            .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
          const sub = subs[0];
          matrix[section] = sub
            ? { status: sub.status, version: sub.version, submissionId: sub._id }
            : { status: 'not_started' };
        }

        const carbonTotal = submissions
          .filter((s) => s.status === 'verified')
          .reduce((sum, s) => {
            const cr = s.carbonResults as any;
            return sum + (cr?.operationalCarbonPerYear ?? 0) + (cr?.wasteCarbonPerYear ?? 0);
          }, 0);

        return {
          ...b,
          sectionMatrix: matrix,
          carbonTotalPerYear: carbonTotal > 0 ? parseFloat(carbonTotal.toFixed(2)) : null,
        };
      })
    );

    sendSuccess(res, { buildings: result, total });
  } catch (err) {
    next(err);
  }
};

export const getCampusPendingQueue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { campusId } = req.params;

    const buildingIds = await Building.find({ campusId }).distinct('_id');

    const pending = await Submission.find({
      buildingId: { $in: buildingIds },
      status: 'submitted',
    })
      .populate('buildingId', 'name type campusId')
      .sort({ submittedAt: 1, createdAt: 1 })
      .lean();

    sendSuccess(res, { pending, total: pending.length });
  } catch (err) {
    next(err);
  }
};

export const getCampusStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { campusId } = req.params;

    const buildingIds = await Building.find({ campusId }).distinct('_id');
    const totalBuildings = buildingIds.length;

    const verifiedSubs = await Submission.find({
      buildingId: { $in: buildingIds },
      status: 'verified',
    })
      .select('buildingId section carbonResults')
      .lean();

    const pendingCount = await Submission.countDocuments({
      buildingId: { $in: buildingIds },
      status: 'submitted',
    });

    let totalCarbonTco2e = 0;
    let scope1 = 0;
    let scope2 = 0;
    const verifiedBuildingSet = new Set<string>();

    for (const s of verifiedSubs) {
      verifiedBuildingSet.add(s.buildingId.toString());
      totalCarbonTco2e += (s.carbonResults?.operationalCarbonPerYear as number) ?? 0;
      const breakdown = s.carbonResults?.breakdown as Record<string, unknown> | undefined;
      const byScope = breakdown?.byScope as Record<string, number> | undefined;
      scope1 += byScope?.scope1 ?? 0;
      scope2 += byScope?.scope2 ?? 0;
    }

    sendSuccess(res, {
      totalBuildings,
      verifiedBuildings: verifiedBuildingSet.size,
      pendingReview: pendingCount,
      carbon: {
        total: parseFloat(totalCarbonTco2e.toFixed(2)),
        scope1: parseFloat(scope1.toFixed(2)),
        scope2: parseFloat(scope2.toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getSubmissionForReview = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId)
      .populate({
        path: 'buildingId',
        select: 'name type campusId floors totalArea',
        populate: { path: 'campusId', select: 'name slug' },
      })
      .lean();

    if (!submission) {
      sendError(res, 'Submission not found', 404);
      return;
    }

    const previousVersion = submission.previousVersionId
      ? await Submission.findById(submission.previousVersionId).select('data version').lean()
      : null;

    sendSuccess(res, { submission, previousVersion });
  } catch (err) {
    next(err);
  }
};

export const approveSubmission = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { submissionId } = req.params;
    const { notes = '' } = req.body as { notes?: string };
    const adminId = req.user!.userId;

    // Load EFs + run engine *before* updating status so the snapshot uses
    // consistent factor values (race-condition window is negligible in practice).
    let carbonUpdate: Record<string, unknown> = {};
    try {
      const { carbonResults, efSnapshot } =
        await adminService.computeCarbonSnapshotForSubmission(submissionId);
      carbonUpdate = {
        'carbonResults.embodiedCarbon': carbonResults.embodiedCarbon,
        'carbonResults.embodiedCarbonPerYear': carbonResults.embodiedCarbonPerYear,
        'carbonResults.operationalCarbonPerYear': carbonResults.operationalCarbonPerYear,
        'carbonResults.wasteCarbonPerYear': carbonResults.wasteCarbonPerYear,
        'carbonResults.breakdown': carbonResults.breakdown,
        'carbonResults.meta': carbonResults.meta,
        'carbonResults.dataSourceInfo': carbonResults.dataSourceInfo,
        'carbonResults.efSnapshot': efSnapshot,
        'carbonResults.calculatedAt': new Date(),
      };
    } catch {
      // Non-fatal: approval proceeds even if carbon engine fails
    }

    const submission = await Submission.findByIdAndUpdate(
      submissionId,
      {
        status: 'verified',
        verifiedAt: new Date(),
        verifiedBy: adminId,
        $push: {
          reviewHistory: {
            action: 'approved',
            adminId,
            notes,
            timestamp: new Date(),
          },
        },
        ...carbonUpdate,
      },
      { new: true }
    );

    if (!submission) {
      sendError(res, 'Submission not found', 404);
      return;
    }

    // Sync the building's section-level status field so the building view
    // reflects the approval immediately.
    const sectionFieldMap: Record<string, string> = {
      civil: 'civilStatus',
      electrical: 'electricalStatus',
      waste: 'wasteStatus',
      overview: 'overviewStatus',
    };
    const sectionField = sectionFieldMap[submission.section as string];
    if (sectionField) {
      await Building.findByIdAndUpdate(submission.buildingId, {
        [sectionField]: 'verified',
        [`${submission.section}SubmissionId`]: submission._id,
      });
    }

    sendSuccess(res, { submission });
  } catch (err) {
    next(err);
  }
};

export const requestRevision = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { submissionId } = req.params;
    const { notes, flaggedFields = [] } = req.body as {
      notes?: string;
      flaggedFields?: string[];
    };
    const adminId = req.user!.userId;

    if (!notes?.trim()) {
      sendError(res, 'Revision notes are required', 400);
      return;
    }

    const submission = await Submission.findByIdAndUpdate(
      submissionId,
      {
        status: 'revision_requested',
        $push: {
          reviewHistory: {
            action: 'revision_requested',
            adminId,
            notes,
            flaggedFields,
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!submission) {
      sendError(res, 'Submission not found', 404);
      return;
    }

    // Sync building's section status to revision_requested
    const sectionFieldMap: Record<string, string> = {
      civil: 'civilStatus',
      electrical: 'electricalStatus',
      waste: 'wasteStatus',
      overview: 'overviewStatus',
    };
    const sectionField = sectionFieldMap[submission.section as string];
    if (sectionField) {
      await Building.findByIdAndUpdate(submission.buildingId, {
        [sectionField]: 'revision_requested',
        reviewNotes: notes,
      });
    }

    sendSuccess(res, { submission });
  } catch (err) {
    next(err);
  }
};

export const getAllBuildingsPaginated = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { campusId, page = '1', limit = '50', search } = req.query as Record<string, string>;

    const query: Record<string, unknown> = {};
    if (campusId) query.campusId = campusId;
    if (search) query.name = { $regex: search, $options: 'i' };

    const [buildings, total] = await Promise.all([
      Building.find(query)
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .populate('campusId', 'name slug')
        .lean(),
      Building.countDocuments(query),
    ]);

    sendPaginated(res, buildings, total, parseInt(page), parseInt(limit));
  } catch (err) {
    next(err);
  }
};

export const getGlobalPendingQueue = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const pending = await Submission.find({ status: 'submitted' })
      .populate('buildingId', 'name type campusId')
      .sort({ submittedAt: 1, createdAt: 1 })
      .lean();

    sendSuccess(res, { pending, total: pending.length });
  } catch (err) {
    next(err);
  }
};

export const getGlobalStats = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const campuses = await Campus.find({ isActive: true }).lean();

    const stats = await Promise.all(
      campuses.map(async (c) => {
        const buildingIds = await Building.find({ campusId: c._id }).distinct('_id');
        const pendingCount = await Submission.countDocuments({
          buildingId: { $in: buildingIds },
          status: 'submitted',
        });
        const verifiedSubs = await Submission.find({
          buildingId: { $in: buildingIds },
          status: 'verified',
        })
          .select('carbonResults buildingId')
          .lean();

        let totalCarbon = 0;
        const verifiedBuildings = new Set<string>();
        for (const s of verifiedSubs) {
          verifiedBuildings.add(s.buildingId.toString());
          totalCarbon += (s.carbonResults?.operationalCarbonPerYear as number) ?? 0;
        }

        return {
          campusId: c._id,
          name: c.name,
          buildingCount: buildingIds.length,
          verifiedBuildings: verifiedBuildings.size,
          pendingReview: pendingCount,
          totalCarbon: parseFloat(totalCarbon.toFixed(2)),
        };
      })
    );

    sendSuccess(res, { stats });
  } catch (err) {
    next(err);
  }
};

export const getBuildingSubmissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const submissions = await Submission.find({ buildingId: req.params.buildingId })
      .sort({ section: 1, version: -1 })
      .lean();

    sendSuccess(res, { submissions });
  } catch (err) {
    next(err);
  }
};
