import apiClient from '@/lib/axios';
import { SectionType } from '@shared/types/submission.types';

export const submissionsApi = {
  // Get or create a draft for a section
  getOrCreateDraft: (buildingId: string, section: SectionType | 'overview') =>
    apiClient.get(`/submissions/draft/${buildingId}/${section}`),

  // Get a single submission by ID
  getById: (id: string) => apiClient.get(`/submissions/${id}`),

  // Validate a submission (returns warnings + completeness score)
  validate: (id: string) => apiClient.post(`/submissions/${id}/validate`),

  // Submit a section draft for review
  submit: (id: string) => apiClient.post(`/submissions/${id}/submit`),

  // Approve a submitted section (reviewer/admin only)
  approve: (id: string, notes?: string) => apiClient.post(`/submissions/${id}/approve`, { notes }),

  // Request revision on a submitted section (reviewer/admin only)
  requestRevision: (id: string, notes: string) =>
    apiClient.post(`/submissions/${id}/request-revision`, { notes }),

  // Discard a draft (authenticated)
  discardDraft: (id: string) => apiClient.delete(`/submissions/${id}/draft`),

  // Withdraw a submitted-but-not-yet-reviewed submission back to draft
  withdraw: (id: string) => apiClient.post(`/submissions/${id}/withdraw`),

  // Start a new version for a dynamic section (after it's verified)
  startNewVersion: (buildingId: string, section: SectionType) =>
    apiClient.post(`/submissions/${buildingId}/${section}/new-version`),

  // Unlock a static section for editing (admin only)
  unlockSection: (buildingId: string, section: SectionType | 'overview', reason: string) =>
    apiClient.post(`/submissions/${buildingId}/${section}/unlock`, { reason }),

  // Update draft data (deep-merge on server)
  updateDraft: (
    id: string,
    data: Record<string, unknown>,
    entryMode?: 'cumulative' | 'room_level'
  ) => apiClient.put(`/submissions/${id}/draft`, { data, entryMode }),

  // Get results for a specific submission
  getResults: (submissionId: string) => apiClient.get(`/submissions/${submissionId}/results`),

  // Get building-level results
  getBuildingResults: (buildingId: string) => apiClient.get(`/submissions/results/${buildingId}`),

  // Get version history for a section
  getHistory: (buildingId: string, section: string) =>
    apiClient.get(`/submissions/${buildingId}/${section}/history`),
};
