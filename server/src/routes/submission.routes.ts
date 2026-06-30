import { Router, Request, Response, NextFunction } from 'express';
import {
  getOrCreateDraftController,
  updateDraftController,
  getSectionHistoryController,
  validateSectionController,
  submitSectionController,
  approveController,
  requestRevisionController,
  discardDraftController,
  withdrawSubmissionController,
  getSingleSubmissionController,
  startNewVersionController,
  unlockStaticSectionController,
  getBuildingResultsController,
  getSectionResultsController,
} from '../controllers/submission.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { UserRole } from '@shared/types/user.types';
import { uploadSingle } from '../middleware/upload';
import { sendError, sendSuccess } from '../utils/response.utils';
import {
  parseUploadedFile,
  extractLoadProfileStats,
  extractSubLoadStats,
  aggregateDGGenerationToMonthly,
  parsePlantGenerationToMonthly,
  parseSolarResourceToMonthly,
  parseWindResourceToMonthly,
} from '../services/fileParser.service';
import { Submission } from '../models/Submission.model';
import { IDGGenerationRecord } from '@shared/types/submission.types';

const router = Router();

// ── Results (place before param routes to avoid shadowing) ────────────────────
router.get('/results/:buildingId/:section', getSectionResultsController);
router.get('/results/:buildingId', getBuildingResultsController);

// ── Draft management ──────────────────────────────────────────────────────────
// GET /draft/:buildingId/:section — get or create draft for a section
router.get('/draft/:buildingId/:section', getOrCreateDraftController);

// PUT /:id/draft — update draft data (deep-merge)
router.put('/:id/draft', updateDraftController);

// DELETE /:id/draft — discard a draft submission
router.delete('/:id/draft', authenticate, discardDraftController);

// GET /:buildingId/:section/history — version history
router.get('/:buildingId/:section/history', getSectionHistoryController);

// ── Lifecycle ─────────────────────────────────────────────────────────────────
router.post('/:id/validate', validateSectionController);
router.post('/:id/submit', submitSectionController);
router.post(
  '/:id/approve',
  authenticate,
  authorize(UserRole.REVIEWER, UserRole.ADMIN),
  approveController
);
router.post(
  '/:id/request-revision',
  authenticate,
  authorize(UserRole.REVIEWER, UserRole.ADMIN),
  requestRevisionController
);
router.post('/:id/withdraw', authenticate, withdrawSubmissionController);

// ── Version management ────────────────────────────────────────────────────────
// These 3-segment routes come before the 1-segment GET /:id to avoid conflicts
router.post('/:buildingId/:section/new-version', authenticate, startNewVersionController);
router.post(
  '/:buildingId/:section/unlock',
  authenticate,
  authorize(UserRole.ADMIN),
  unlockStaticSectionController
);

// ── File upload endpoints (Phase 2 operational data) ──────────────────────────

// POST /:id/upload/load-profile — parse time-series, store statistics only
router.post(
  '/:id/upload/load-profile',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return sendError(res, 'No file uploaded', 400);

      const { rows } = parseUploadedFile(req.file.buffer, req.file.originalname);
      const stats = extractLoadProfileStats(rows, req.file.originalname);

      const submission = await Submission.findById(req.params.id);
      if (!submission) return sendError(res, 'Submission not found', 404);

      const data = (submission.data as Record<string, unknown>) ?? {};
      const electrical = (data.electrical as Record<string, unknown>) ?? {};
      const operational = (electrical.operational as Record<string, unknown>) ?? {
        utilityBills: [],
        dgGenerationRecords: [],
      };

      operational.loadProfileStats = stats;
      operational.hasLoadProfileData = true;
      electrical.operational = operational;
      data.electrical = electrical;
      submission.data = data;
      submission.markModified('data');
      await submission.save();

      return sendSuccess(
        res,
        stats,
        `Processed ${stats.totalReadings ?? rows.length} readings from ${req.file.originalname}`
      );
    } catch (err) {
      next(err);
    }
  }
);

// POST /:id/upload/sub-load-profile — extract per-sub-circuit statistics
router.post(
  '/:id/upload/sub-load-profile',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return sendError(res, 'No file uploaded', 400);

      const { rows } = parseUploadedFile(req.file.buffer, req.file.originalname);
      const stats = extractSubLoadStats(rows, req.file.originalname);

      const submission = await Submission.findById(req.params.id);
      if (!submission) return sendError(res, 'Submission not found', 404);

      const data = (submission.data as Record<string, unknown>) ?? {};
      const electrical = (data.electrical as Record<string, unknown>) ?? {};
      const operational = (electrical.operational as Record<string, unknown>) ?? {
        utilityBills: [],
        dgGenerationRecords: [],
      };

      operational.subLoadProfileStats = stats;
      operational.hasSubLoadData = true;
      electrical.operational = operational;
      data.electrical = electrical;
      submission.data = data;
      submission.markModified('data');
      await submission.save();

      return sendSuccess(
        res,
        stats,
        `Processed ${stats.subLoads.length} sub-loads from ${req.file.originalname}`
      );
    } catch (err) {
      next(err);
    }
  }
);

// POST /:id/upload/dg-generation — aggregate timestamped log to monthly summaries
router.post(
  '/:id/upload/dg-generation',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return sendError(res, 'No file uploaded', 400);

      const { rows } = parseUploadedFile(req.file.buffer, req.file.originalname);
      const records = aggregateDGGenerationToMonthly(rows, req.file.originalname);

      const submission = await Submission.findById(req.params.id);
      if (!submission) return sendError(res, 'Submission not found', 404);

      const data = (submission.data as Record<string, unknown>) ?? {};
      const electrical = (data.electrical as Record<string, unknown>) ?? {};
      const operational = (electrical.operational as Record<string, unknown>) ?? {
        utilityBills: [],
        dgGenerationRecords: [],
      };

      // Merge: replace records for same DG ID + month, keep others
      const existing = (operational.dgGenerationRecords as IDGGenerationRecord[]) ?? [];
      const uploadedKeys = new Set(records.map((r) => `${r.dgId}||${r.month}`));
      const merged = [
        ...existing.filter((r) => !uploadedKeys.has(`${r.dgId}||${r.month}`)),
        ...records,
      ];

      operational.dgGenerationRecords = merged;
      electrical.operational = operational;
      data.electrical = electrical;
      submission.data = data;
      submission.markModified('data');
      await submission.save();

      return sendSuccess(
        res,
        { records, totalRecords: merged.length },
        `Imported ${records.length} monthly DG records`
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── Phase 3: Renewable time-series upload endpoints ───────────────────────────

// POST /:id/upload/plant-generation — parse plant generation CSV to monthly aggregates
router.post(
  '/:id/upload/plant-generation',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return sendError(res, 'No file uploaded', 400);

      const { monthly, meta } = parsePlantGenerationToMonthly(
        req.file.buffer,
        req.file.originalname
      );

      const submission = await Submission.findById(req.params.id);
      if (!submission) return sendError(res, 'Submission not found', 404);

      const data = (submission.data as Record<string, unknown>) ?? {};
      const electrical = (data.electrical as Record<string, unknown>) ?? {};

      // Merge: replace records for same plant+month, keep others
      const existing = (electrical.plantGenerationMonthly as typeof monthly) ?? [];
      const uploadedKeys = new Set(monthly.map((r) => `${r.plantId}||${r.month}`));
      const merged = [
        ...existing.filter((r) => !uploadedKeys.has(`${r.plantId}||${r.month}`)),
        ...monthly,
      ];

      electrical.plantGenerationMonthly = merged;
      electrical.plantGenerationUploadMeta = meta;
      data.electrical = electrical;
      submission.data = data;
      submission.markModified('data');
      await submission.save();

      return sendSuccess(
        res,
        { monthly: merged, meta },
        `Imported ${monthly.length} monthly plant generation records`
      );
    } catch (err) {
      next(err);
    }
  }
);

// POST /:id/upload/solar-resource — parse solar irradiance CSV to monthly averages
router.post(
  '/:id/upload/solar-resource',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return sendError(res, 'No file uploaded', 400);

      const { monthly, meta } = parseSolarResourceToMonthly(req.file.buffer, req.file.originalname);

      const submission = await Submission.findById(req.params.id);
      if (!submission) return sendError(res, 'Submission not found', 404);

      const data = (submission.data as Record<string, unknown>) ?? {};
      const electrical = (data.electrical as Record<string, unknown>) ?? {};

      electrical.solarResourceMonthly = monthly;
      electrical.solarResourceUploadMeta = meta;
      data.electrical = electrical;
      submission.data = data;
      submission.markModified('data');
      await submission.save();

      return sendSuccess(
        res,
        { monthly, meta },
        `Processed ${meta.rowCount} readings into ${monthly.length} monthly records`
      );
    } catch (err) {
      next(err);
    }
  }
);

// POST /:id/upload/wind-resource — parse wind data CSV to monthly averages
router.post(
  '/:id/upload/wind-resource',
  authenticate,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return sendError(res, 'No file uploaded', 400);

      const { monthly, meta } = parseWindResourceToMonthly(req.file.buffer, req.file.originalname);

      const submission = await Submission.findById(req.params.id);
      if (!submission) return sendError(res, 'Submission not found', 404);

      const data = (submission.data as Record<string, unknown>) ?? {};
      const electrical = (data.electrical as Record<string, unknown>) ?? {};

      electrical.windResourceMonthly = monthly;
      electrical.windResourceUploadMeta = meta;
      data.electrical = electrical;
      submission.data = data;
      submission.markModified('data');
      await submission.save();

      return sendSuccess(
        res,
        { monthly, meta },
        `Processed ${meta.rowCount} readings into ${monthly.length} monthly records`
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── Single submission (catch-all last) ────────────────────────────────────────
router.get('/:id', getSingleSubmissionController);

export default router;
