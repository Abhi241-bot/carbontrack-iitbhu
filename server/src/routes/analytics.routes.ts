import { Router, Request, Response } from 'express';
import {
  getDomainBreakdown,
  getTimeSeries,
  getBuildingComparison,
  getIntensityScatter,
  getLeaderboard,
  getWasteBreakdown,
  getCampusSummary,
} from '../services/analytics.service';

const router = Router();

function sendOk(res: Response, data: unknown) {
  res.json({ success: true, data });
}

function sendErr(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ success: false, message });
}

// GET /api/analytics/campus-summary
router.get('/campus-summary', async (_req: Request, res: Response) => {
  try {
    const data = await getCampusSummary();
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

// GET /api/analytics/domain-breakdown?campus=<slug>
router.get('/domain-breakdown', async (req: Request, res: Response) => {
  try {
    const campusSlug = req.query.campus as string | undefined;
    const data = await getDomainBreakdown(campusSlug);
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

// GET /api/analytics/time-series?campus=<slug>
router.get('/time-series', async (req: Request, res: Response) => {
  try {
    const campusSlug = req.query.campus as string | undefined;
    const data = await getTimeSeries(campusSlug);
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

// GET /api/analytics/building-compare?ids=id1,id2,id3
router.get('/building-compare', async (req: Request, res: Response) => {
  try {
    const raw = (req.query.ids as string) ?? '';
    const ids = raw ? raw.split(',').filter(Boolean) : [];
    const data = await getBuildingComparison(ids);
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

// GET /api/analytics/intensity-scatter?campus=<slug>
router.get('/intensity-scatter', async (req: Request, res: Response) => {
  try {
    const campusSlug = req.query.campus as string | undefined;
    const data = await getIntensityScatter(campusSlug);
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

// GET /api/analytics/leaderboard?campus=<slug>
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const campusSlug = req.query.campus as string | undefined;
    const data = await getLeaderboard(15, campusSlug);
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

// GET /api/analytics/waste-breakdown?campus=<slug>
router.get('/waste-breakdown', async (req: Request, res: Response) => {
  try {
    const campusSlug = req.query.campus as string | undefined;
    const data = await getWasteBreakdown(campusSlug);
    sendOk(res, data);
  } catch (err) {
    sendErr(res, err);
  }
});

export default router;
