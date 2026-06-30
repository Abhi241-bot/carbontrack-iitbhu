import apiClient from '@/lib/axios';

export const dashboardApi = {
  getPublicStats: (campusSlug?: string) =>
    apiClient.get('/dashboard/public-stats', {
      params: campusSlug ? { campusSlug } : {},
    }),
  getByType: () => apiClient.get('/dashboard/by-type'),
  getTopBuildings: () => apiClient.get('/dashboard/top-buildings'),
  getTimeline: () => apiClient.get('/dashboard/timeline'),
  getMyStats: () => apiClient.get('/dashboard/my-stats'),
};
