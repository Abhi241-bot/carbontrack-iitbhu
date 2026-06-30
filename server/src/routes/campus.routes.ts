import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate';
import { sendSuccess, sendError } from '../utils/response.utils';
import * as campusService from '../services/campus.service';
import Campus from '../models/Campus.model';

/** Resolves to true when the requesting user may edit this campus's infrastructure. */
async function canAccessInfrastructure(
  slug: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (role === 'admin' || role === 'reviewer') return true;
  const campus = await Campus.findOne({ slug, isActive: true }).select(
    'infrastructureAssignedMembers'
  );
  if (!campus) return false;
  return campus.infrastructureAssignedMembers.some((m) => m.toString() === userId);
}

const router = Router();

// ── LIST ALL CAMPUSES (public) ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const campuses = await campusService.getAllCampuses();
    return sendSuccess(res, campuses);
  } catch (err) {
    next(err);
  }
});

// ── CREATE CAMPUS (admin only) ─────────────────────────────────────────────
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const campus = await campusService.createCampus(req.body, req.user!.userId);
    return sendSuccess(res, campus, 'Campus created', 201);
  } catch (err) {
    next(err);
  }
});

// ── GET SINGLE CAMPUS WITH STATS (public) ──────────────────────────────────
// IMPORTANT: must come BEFORE /:slug/buildings etc.
router.get('/:slug', async (req, res, next) => {
  try {
    const campus = await campusService.getCampusWithStats(req.params.slug);
    return sendSuccess(res, campus);
  } catch (err) {
    next(err);
  }
});

// ── CAMPUS CARBON RESULTS (public) ────────────────────────────────────────
router.get('/:slug/carbon', async (req, res, next) => {
  try {
    const result = await campusService.getCampusCarbon(req.params.slug);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ── UPDATE CAMPUS OVERVIEW ─────────────────────────────────────────────────
router.put(
  '/:slug/overview',
  authenticate,
  authorize('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const campus = await campusService.updateCampusOverview(
        req.params.slug,
        req.body,
        req.user!.userId
      );
      return sendSuccess(res, campus);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:slug/overview/approve',
  authenticate,
  authorize('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const campus = await campusService.approveCampusOverview(req.params.slug, req.user!.userId);
      return sendSuccess(res, campus);
    } catch (err) {
      next(err);
    }
  }
);

// ── INFRASTRUCTURE DRAFT ───────────────────────────────────────────────────
router.get('/:slug/infrastructure/draft', authenticate, async (req, res, next) => {
  try {
    if (!(await canAccessInfrastructure(req.params.slug, req.user!.userId, req.user!.role))) {
      return sendError(res, 'Not authorised to access this campus infrastructure', 403);
    }
    const campus = await campusService.getCampusInfrastructureDraft(req.params.slug);
    return sendSuccess(res, campus);
  } catch (err) {
    next(err);
  }
});

router.put('/:slug/infrastructure/draft', authenticate, async (req, res, next) => {
  try {
    if (!(await canAccessInfrastructure(req.params.slug, req.user!.userId, req.user!.role))) {
      return sendError(res, 'Not authorised to access this campus infrastructure', 403);
    }
    const campus = await campusService.updateInfrastructureDraft(
      req.params.slug,
      req.body.data,
      req.user!.userId
    );
    return sendSuccess(res, campus);
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/infrastructure/submit', authenticate, async (req, res, next) => {
  try {
    if (!(await canAccessInfrastructure(req.params.slug, req.user!.userId, req.user!.role))) {
      return sendError(res, 'Not authorised to access this campus infrastructure', 403);
    }
    const campus = await campusService.submitInfrastructure(req.params.slug, req.user!.userId);
    return sendSuccess(res, campus);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:slug/infrastructure/approve',
  authenticate,
  authorize('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const campus = await campusService.approveInfrastructure(req.params.slug, req.user!.userId);
      return sendSuccess(res, campus);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:slug/infrastructure/request-revision',
  authenticate,
  authorize('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const { notes } = req.body;
      if (!notes?.trim()) return sendError(res, 'Revision notes are required', 400);
      const campus = await campusService.requestInfrastructureRevision(
        req.params.slug,
        req.user!.userId,
        notes
      );
      return sendSuccess(res, campus);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:slug/infrastructure/recalculate',
  authenticate,
  authorize('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const carbonResults = await campusService.recalculateCampusCarbon(req.params.slug);
      return sendSuccess(res, { carbonResults });
    } catch (err) {
      next(err);
    }
  }
);

// ── INFRASTRUCTURE MEMBER ASSIGNMENT (admin only) ─────────────────────────
router.get(
  '/:slug/infrastructure/members',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const members = await campusService.getInfrastructureMembers(req.params.slug);
      return sendSuccess(res, members);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:slug/infrastructure/assign',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { userId } = req.body as { userId: string };
      if (!userId) return sendError(res, 'userId is required', 400);
      const campus = await campusService.assignInfrastructureMember(
        req.params.slug,
        userId,
        req.user!.userId
      );
      return sendSuccess(res, campus);
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:slug/infrastructure/assign/:userId',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const campus = await campusService.removeInfrastructureMember(
        req.params.slug,
        req.params.userId,
        req.user!.userId
      );
      return sendSuccess(res, campus);
    } catch (err) {
      next(err);
    }
  }
);

// ── BUILDINGS SCOPED TO CAMPUS (public) ───────────────────────────────────
router.get('/:slug/buildings', async (req, res, next) => {
  try {
    const result = await campusService.getBuildingsByCampus(req.params.slug, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      type: req.query.type as string,
      search: req.query.search as string,
    });
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;
