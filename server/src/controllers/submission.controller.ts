import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../utils/response.utils';
import * as submissionService from '../services/submission.service';
import { SectionType } from '@shared/types/submission.types';

const PLACEHOLDER_USER_ID = '000000000000000000000001';

function getUserId(req: Request): string {
  return req.user?.userId ?? PLACEHOLDER_USER_ID;
}

function getStatusCode(err: Error): number {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === '404') return 404;
  if (code === '400') return 400;
  if (code === '403') return 403;
  return 500;
}

function handleError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof Error) {
    sendError(res, err.message, getStatusCode(err));
  } else {
    next(err);
  }
}

// ── Draft management ──────────────────────────────────────────────────────────

// GET /draft/:buildingId/:section
export async function getOrCreateDraftController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId, section } = req.params;
    const userId = getUserId(req);
    const submission = await submissionService.getOrCreateDraft(
      buildingId,
      section as SectionType | 'overview',
      userId
    );
    sendSuccess(res, submission, 'Draft ready');
  } catch (err) {
    handleError(err, res, next);
  }
}

// PUT /:id/draft
export async function updateDraftController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { data, entryMode } = req.body as {
      data: Record<string, unknown>;
      entryMode?: 'cumulative' | 'room_level';
    };
    const userId = getUserId(req);
    const submission = await submissionService.updateSectionDraft(
      id,
      userId,
      data ?? {},
      entryMode
    );
    sendSuccess(res, submission, 'Draft updated');
  } catch (err) {
    handleError(err, res, next);
  }
}

// GET /:buildingId/:section/history
export async function getSectionHistoryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId, section } = req.params;
    const submissions = await submissionService.getAllSectionSubmissions(
      buildingId,
      section as SectionType | 'overview'
    );
    sendSuccess(res, submissions, 'Version history fetched');
  } catch (err) {
    handleError(err, res, next);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

// POST /:id/validate
export async function validateSectionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const result = await submissionService.validateSection(id);
    sendSuccess(res, result, 'Validation complete');
  } catch (err) {
    handleError(err, res, next);
  }
}

// POST /:id/submit
export async function submitSectionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const submission = await submissionService.submitSection(id, userId);
    sendSuccess(res, submission, 'Section submitted');
  } catch (err) {
    handleError(err, res, next);
  }
}

// POST /:id/approve
export async function approveController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const reviewerId = getUserId(req);
    const { notes } = req.body as { notes?: string };
    const submission = await submissionService.approveSection(id, reviewerId, notes);
    sendSuccess(res, submission, 'Section approved');
  } catch (err) {
    handleError(err, res, next);
  }
}

// POST /:id/request-revision
export async function requestRevisionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const reviewerId = getUserId(req);
    const { notes } = req.body as { notes?: string };
    if (!notes?.trim()) {
      sendError(res, 'Review notes are required', 400);
      return;
    }
    const submission = await submissionService.requestRevision(id, reviewerId, notes.trim());
    sendSuccess(res, submission, 'Revision requested');
  } catch (err) {
    handleError(err, res, next);
  }
}

// GET /:id
export async function getSingleSubmissionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const submission = await submissionService.getResults(id);
    if (!submission) {
      sendError(res, 'Submission not found', 404);
      return;
    }
    sendSuccess(res, submission, 'Submission fetched');
  } catch (err) {
    handleError(err, res, next);
  }
}

// ── Version management ────────────────────────────────────────────────────────

// POST /:buildingId/:section/new-version
export async function startNewVersionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId, section } = req.params;
    const userId = getUserId(req);
    const submission = await submissionService.startNewVersion(
      buildingId,
      section as SectionType | 'overview',
      userId
    );
    sendSuccess(res, submission, 'New version draft created', 201);
  } catch (err) {
    handleError(err, res, next);
  }
}

// POST /:buildingId/:section/unlock
export async function unlockStaticSectionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId, section } = req.params;
    const adminId = getUserId(req);
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) {
      sendError(res, 'Unlock reason is required', 400);
      return;
    }
    const submission = await submissionService.unlockStaticSection(
      buildingId,
      section as SectionType | 'overview',
      adminId,
      reason.trim()
    );
    sendSuccess(res, submission, 'Section unlocked — new draft created', 201);
  } catch (err) {
    handleError(err, res, next);
  }
}

// DELETE /:id/draft
export async function discardDraftController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const result = await submissionService.discardDraft(id, userId);
    sendSuccess(res, result, 'Draft discarded');
  } catch (err) {
    handleError(err, res, next);
  }
}

// POST /:id/withdraw
export async function withdrawSubmissionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const result = await submissionService.withdrawSubmission(id, userId);
    sendSuccess(res, result, 'Submission withdrawn — back to draft');
  } catch (err) {
    handleError(err, res, next);
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

// GET /results/:buildingId
export async function getBuildingResultsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId } = req.params;
    const results = await submissionService.getBuildingResults(buildingId);
    sendSuccess(res, results, 'Building results fetched');
  } catch (err) {
    handleError(err, res, next);
  }
}

// GET /results/:buildingId/:section
export async function getSectionResultsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { buildingId, section } = req.params;
    const results = await submissionService.getSectionResults(buildingId, section);
    sendSuccess(res, results, 'Section results fetched');
  } catch (err) {
    handleError(err, res, next);
  }
}
