import apiClient from '@/lib/axios';

export const adminApi = {
  // Stats
  getStats: () => apiClient.get('/admin/stats'),

  // Users
  listUsers: (params?: { search?: string; role?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/users', { params }),
  changeUserRole: (userId: string, role: string) =>
    apiClient.patch(`/admin/users/${userId}/role`, { role }),

  // Audit logs
  getAuditLogs: (params?: { page?: number; limit?: number }) =>
    apiClient.get('/admin/audit-logs', { params }),

  // Emission factors
  getEmissionFactors: () => apiClient.get('/admin/emission-factors'),
  createEmissionFactor: (data: {
    category: string;
    name: string;
    value: number;
    unit: string;
    scope: string;
    source?: string;
    year?: number;
    region?: string;
    subcategory?: string;
  }) => apiClient.post('/admin/emission-factors', data),
  updateEmissionFactor: (id: string, value: number) =>
    apiClient.put(`/admin/emission-factors/${id}`, { value }),
  deleteEmissionFactor: (id: string) => apiClient.delete(`/admin/emission-factors/${id}`),
  setDefaultEmissionFactor: (id: string) =>
    apiClient.post(`/admin/emission-factors/${id}/set-default`),

  // Submissions
  listSubmissions: (params?: {
    status?: string;
    section?: string;
    page?: number;
    limit?: number;
  }) => apiClient.get('/admin/submissions', { params }),
  approveSubmission: (id: string) => apiClient.post(`/admin/submissions/${id}/approve`),
  requestRevision: (id: string, notes: string) =>
    apiClient.post(`/admin/submissions/${id}/request-revision`, { notes }),

  // Membership requests
  listMembershipRequests: (params?: {
    status?: string;
    buildingId?: string;
    page?: number;
    limit?: number;
  }) => apiClient.get('/admin/membership-requests', { params }),
  approveMembershipRequest: (id: string) =>
    apiClient.post(`/admin/membership-requests/${id}/approve`),
  rejectMembershipRequest: (id: string) =>
    apiClient.post(`/admin/membership-requests/${id}/reject`),

  // Building CRUD
  createBuilding: (data: {
    name: string;
    shortName?: string;
    type: string;
    description?: string;
    floors: number;
    totalArea?: number;
    yearBuilt?: number;
    tags?: string[];
  }) => apiClient.post('/admin/buildings', data),
  deleteBuilding: (buildingId: string) => apiClient.delete(`/admin/buildings/${buildingId}`),

  // Building member management
  assignMember: (buildingId: string, userId: string) =>
    apiClient.post(`/admin/buildings/${buildingId}/assign`, { userId }),
  removeMember: (buildingId: string, userId: string) =>
    apiClient.delete(`/admin/buildings/${buildingId}/assign/${userId}`),

  // Campus-scoped admin endpoints
  getCampuses: () => apiClient.get('/admin/campuses'),
  getCampusStats: (campusId: string) => apiClient.get(`/admin/campuses/${campusId}/stats`),
  getCampusBuildings: (
    campusId: string,
    params?: { search?: string; page?: number; limit?: number }
  ) => apiClient.get(`/admin/campuses/${campusId}/buildings`, { params }),
  getCampusPendingQueue: (campusId: string) => apiClient.get(`/admin/campuses/${campusId}/pending`),
  getSubmissionForReview: (submissionId: string) =>
    apiClient.get(`/admin/submissions/${submissionId}`),
  approveSubmissionWithNotes: (submissionId: string, notes?: string) =>
    apiClient.post(`/admin/submissions/${submissionId}/approve`, { notes }),
  requestRevisionWithFields: (submissionId: string, notes: string, flaggedFields?: string[]) =>
    apiClient.post(`/admin/submissions/${submissionId}/request-revision`, {
      notes,
      flaggedFields,
    }),
  getBuildingSubmissions: (buildingId: string) =>
    apiClient.get(`/admin/buildings/${buildingId}/submissions`),
  getGlobalStats: () => apiClient.get('/admin/global-stats'),
};
