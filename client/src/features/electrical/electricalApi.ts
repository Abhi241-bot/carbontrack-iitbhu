import apiClient from '@/lib/axios';

function fileFormData(file: File): FormData {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const electricalOperationalApi = {
  // ── Phase 2 ──────────────────────────────────────────────────────────────
  uploadLoadProfile: (submissionId: string, file: File) =>
    apiClient.post(
      `/submissions/${submissionId}/upload/load-profile`,
      fileFormData(file),
      multipart
    ),

  uploadSubLoadProfile: (submissionId: string, file: File) =>
    apiClient.post(
      `/submissions/${submissionId}/upload/sub-load-profile`,
      fileFormData(file),
      multipart
    ),

  uploadDGGeneration: (submissionId: string, file: File) =>
    apiClient.post(
      `/submissions/${submissionId}/upload/dg-generation`,
      fileFormData(file),
      multipart
    ),

  // ── Phase 3 ──────────────────────────────────────────────────────────────
  uploadPlantGeneration: (submissionId: string, file: File) =>
    apiClient.post(
      `/submissions/${submissionId}/upload/plant-generation`,
      fileFormData(file),
      multipart
    ),

  uploadSolarResource: (submissionId: string, file: File) =>
    apiClient.post(
      `/submissions/${submissionId}/upload/solar-resource`,
      fileFormData(file),
      multipart
    ),

  uploadWindResource: (submissionId: string, file: File) =>
    apiClient.post(
      `/submissions/${submissionId}/upload/wind-resource`,
      fileFormData(file),
      multipart
    ),
};
