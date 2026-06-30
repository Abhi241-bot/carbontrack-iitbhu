import apiClient from '@/lib/axios';

export const campusApi = {
  // Campus CRUD
  getAll: () => apiClient.get('/campus'),
  getBySlug: (slug: string) => apiClient.get(`/campus/${slug}`),
  create: (data: Record<string, unknown>) => apiClient.post('/campus', data),

  // Campus overview section
  updateOverview: (slug: string, data: Record<string, unknown>) =>
    apiClient.put(`/campus/${slug}/overview`, data),
  approveOverview: (slug: string) => apiClient.post(`/campus/${slug}/overview/approve`),

  // Infrastructure section
  getInfrastructureDraft: (slug: string) => apiClient.get(`/campus/${slug}/infrastructure/draft`),
  updateInfrastructureDraft: (slug: string, data: Record<string, unknown>) =>
    apiClient.put(`/campus/${slug}/infrastructure/draft`, { data }),
  submitInfrastructure: (slug: string) => apiClient.post(`/campus/${slug}/infrastructure/submit`),
  approveInfrastructure: (slug: string) => apiClient.post(`/campus/${slug}/infrastructure/approve`),
  requestInfrastructureRevision: (slug: string, notes: string) =>
    apiClient.post(`/campus/${slug}/infrastructure/request-revision`, { notes }),

  // Buildings scoped to campus
  getBuildingsByCampus: (slug: string, params?: Record<string, unknown>) =>
    apiClient.get(`/campus/${slug}/buildings`, { params }),

  // Infrastructure recalculate + carbon endpoint
  recalculateCampusCarbon: (slug: string) =>
    apiClient.post(`/campus/${slug}/infrastructure/recalculate`),
  getCampusCarbon: (slug: string) => apiClient.get(`/campus/${slug}/carbon`),

  // Infrastructure member assignment (admin only)
  getInfrastructureMembers: (slug: string) =>
    apiClient.get(`/campus/${slug}/infrastructure/members`),
  assignInfrastructureMember: (slug: string, userId: string) =>
    apiClient.post(`/campus/${slug}/infrastructure/assign`, { userId }),
  removeInfrastructureMember: (slug: string, userId: string) =>
    apiClient.delete(`/campus/${slug}/infrastructure/assign/${userId}`),
};
