import apiClient from '@/lib/axios';

export const analyticsApi = {
  getCampusSummary: () => apiClient.get('/analytics/campus-summary'),
  getDomainBreakdown: (campusSlug?: string) =>
    apiClient.get('/analytics/domain-breakdown', {
      params: campusSlug ? { campus: campusSlug } : {},
    }),
  getTimeSeries: (campusSlug?: string) =>
    apiClient.get('/analytics/time-series', {
      params: campusSlug ? { campus: campusSlug } : {},
    }),
  getBuildingComparison: (ids: string[]) =>
    apiClient.get('/analytics/building-compare', { params: { ids: ids.join(',') } }),
  getIntensityScatter: (campusSlug?: string) =>
    apiClient.get('/analytics/intensity-scatter', {
      params: campusSlug ? { campus: campusSlug } : {},
    }),
  getLeaderboard: (campusSlug?: string) =>
    apiClient.get('/analytics/leaderboard', {
      params: campusSlug ? { campus: campusSlug } : {},
    }),
  getWasteBreakdown: (campusSlug?: string) =>
    apiClient.get('/analytics/waste-breakdown', {
      params: campusSlug ? { campus: campusSlug } : {},
    }),
};
