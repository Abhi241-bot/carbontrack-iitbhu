import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  getAllBuildingsController,
  getBuildingByIdController,
  getBuildingStatsController,
  updateBuildingController,
  assignMemberController,
  removeMemberController,
  getSectionSummaryController,
  getCarbonSummaryController,
} from '../controllers/building.controller';

const router = Router();

// Read routes require authentication
router.get('/', authenticate, getAllBuildingsController);
router.get('/stats', authenticate, getBuildingStatsController);
router.get('/:id', authenticate, getBuildingByIdController);
router.get('/:id/section-summary', authenticate, getSectionSummaryController);
router.get('/:id/carbon-summary', authenticate, getCarbonSummaryController);

// Write routes (admin actions handled via /admin/* routes)
router.put('/:id', authenticate, updateBuildingController);
router.post('/:id/assign', authenticate, assignMemberController);
router.delete('/:id/assign/:userId', authenticate, removeMemberController);

export default router;
