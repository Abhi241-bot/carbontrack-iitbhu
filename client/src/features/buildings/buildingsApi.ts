import apiClient from '@/lib/axios';

export interface BuildingFilters {
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  campusSlug?: string;
  campusId?: string;
}

export const buildingsApi = {
  getAll: (params?: BuildingFilters) => apiClient.get('/buildings', { params }),
  getById: (id: string) => apiClient.get(`/buildings/${id}`),
  getStats: () => apiClient.get('/buildings/stats'),
  getSectionSummary: (id: string) => apiClient.get(`/buildings/${id}/section-summary`),
  getCarbonSummary: (id: string) => apiClient.get(`/buildings/${id}/carbon-summary`),
};
