import apiClient from '../../lib/axios';

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  department?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export const authApi = {
  register: (data: RegisterData) => apiClient.post('/auth/register', data),
  verifyEmail: (token: string) => apiClient.post('/auth/verify-email', { token }),
  resendVerification: (email: string) => apiClient.post('/auth/resend-verification', { email }),
  login: (data: LoginData) => apiClient.post('/auth/login', data),
  refreshToken: () => apiClient.post('/auth/refresh-token'),
  logout: () => apiClient.post('/auth/logout'),
  forgotPassword: (email: string) => apiClient.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    apiClient.post('/auth/reset-password', { token, password }),
  getMe: () => apiClient.get('/auth/me'),
};
