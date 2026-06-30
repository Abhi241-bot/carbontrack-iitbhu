import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { UserRole } from '@shared/types/user.types';
import {
  getStatsController,
  listUsersController,
  changeUserRoleController,
  getAuditLogsController,
  getEmissionFactorsController,
  updateEmissionFactorController,
  createEmissionFactorController,
  deleteEmissionFactorController,
  setDefaultEmissionFactorController,
  recalculateSubmissionController,
  listSubmissionsAdminController,
  approveSubmissionAdminController,
  requestRevisionAdminController,
  // New campus-scoped controllers
  verifyCampusAccess,
  getCampusList,
  getCampusDetail,
  getCampusBuildings,
  getCampusPendingQueue,
  getCampusStats,
  getSubmissionForReview,
  approveSubmission,
  requestRevision,
  getAllBuildingsPaginated,
  getGlobalPendingQueue,
  getGlobalStats,
  getBuildingSubmissions,
} from '../controllers/admin.controller';
import {
  assignMemberController,
  removeMemberController,
  createBuildingController,
  deleteBuildingController,
} from '../controllers/building.controller';
import {
  listRequestsAdminController,
  approveRequestController,
  rejectRequestController,
} from '../controllers/membershipRequest.controller';

const router = Router();

// All admin routes require authentication + ADMIN role
router.use(authenticate, authorize(UserRole.ADMIN));

// ── CAMPUS MANAGEMENT ─────────────────────────────────────────────────────────
router.get('/campuses', getCampusList);
router.get('/campuses/:campusId', verifyCampusAccess, getCampusDetail);
router.get('/campuses/:campusId/buildings', verifyCampusAccess, getCampusBuildings);
router.post('/campuses/:campusId/buildings', verifyCampusAccess, (req, res, next) => {
  req.body.campusId = req.params.campusId;
  createBuildingController(req, res, next);
});
router.get('/campuses/:campusId/pending', verifyCampusAccess, getCampusPendingQueue);
router.get('/campuses/:campusId/stats', verifyCampusAccess, getCampusStats);

// ── CROSS-CAMPUS (admin) ──────────────────────────────────────────────────────
router.get('/buildings', getAllBuildingsPaginated);
router.get('/pending', getGlobalPendingQueue);
router.get('/global-stats', getGlobalStats);

// ── SUBMISSION REVIEW ACTIONS ─────────────────────────────────────────────────
router.get('/submissions/:submissionId', getSubmissionForReview);
router.get('/submissions/:submissionId/previous', getSubmissionForReview);
router.post('/submissions/:submissionId/approve', approveSubmission);
router.post('/submissions/:submissionId/request-revision', requestRevision);
router.post('/submissions/:submissionId/recalculate', recalculateSubmissionController);

// ── LEGACY SUBMISSION ROUTES (kept for Submissions tab) ───────────────────────
router.get('/submissions', listSubmissionsAdminController);
// Note: approve/revision routes above supersede the legacy ones

// ── BUILDING SUBMISSIONS ──────────────────────────────────────────────────────
router.get('/buildings/:buildingId/submissions', getBuildingSubmissions);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', getStatsController);

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users', listUsersController);
router.patch('/users/:id/role', changeUserRoleController);

// ── Audit logs ────────────────────────────────────────────────────────────────
router.get('/audit-logs', getAuditLogsController);

// ── Emission factors ──────────────────────────────────────────────────────────
router.get('/emission-factors', getEmissionFactorsController);
router.post('/emission-factors', createEmissionFactorController);
router.put('/emission-factors/:id', updateEmissionFactorController);
router.delete('/emission-factors/:id', deleteEmissionFactorController);
router.post('/emission-factors/:id/set-default', setDefaultEmissionFactorController);

// ── Building CRUD ─────────────────────────────────────────────────────────────
router.post('/buildings', createBuildingController);
router.delete('/buildings/:id', deleteBuildingController);

// ── Building member management ────────────────────────────────────────────────
router.post('/buildings/:id/assign', assignMemberController);
router.delete('/buildings/:id/assign/:userId', removeMemberController);

// ── Membership requests ───────────────────────────────────────────────────────
router.get('/membership-requests', listRequestsAdminController);
router.post('/membership-requests/:id/approve', approveRequestController);
router.post('/membership-requests/:id/reject', rejectRequestController);

export default router;
