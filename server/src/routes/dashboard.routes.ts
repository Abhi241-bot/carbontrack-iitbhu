import { Router } from 'express';
import {
  getPublicStatsController,
  getByTypeController,
  getTopBuildingsController,
  getTimelineController,
  getMyStatsController,
} from '../controllers/dashboard.controller';

const router = Router();

// All routes are public — auth will be wired in a later phase
router.get('/public-stats', getPublicStatsController);
router.get('/by-type', getByTypeController);
router.get('/top-buildings', getTopBuildingsController);
router.get('/timeline', getTimelineController);
router.get('/my-stats', getMyStatsController);

export default router;
