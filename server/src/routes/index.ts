import { Router } from 'express';
import authRoutes from './auth.routes';
import buildingRoutes from './building.routes';
import submissionRoutes from './submission.routes';
import dashboardRoutes from './dashboard.routes';
import adminRoutes from './admin.routes';
import membershipRequestRoutes from './membershipRequest.routes';
import analyticsRoutes from './analytics.routes';
import campusRoutes from './campus.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/buildings', buildingRoutes);
router.use('/submissions', submissionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);
router.use('/membership-requests', membershipRequestRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/campus', campusRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
