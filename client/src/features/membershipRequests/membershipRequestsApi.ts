import apiClient from '@/lib/axios';

export const membershipRequestsApi = {
  // Submit a request to join a building
  create: (buildingId: string, message?: string) =>
    apiClient.post('/membership-requests', { buildingId, message }),

  // Submit a request to fill campus infrastructure data
  createCampusRequest: (campusId: string, message?: string) =>
    apiClient.post('/membership-requests/campus-infrastructure', { campusId, message }),

  // Get current user's requests
  getMy: () => apiClient.get('/membership-requests/my'),
};
