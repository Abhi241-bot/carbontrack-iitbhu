export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  VERIFY_EMAIL: '/verify-email/:token',
  DASHBOARD: '/dashboard',
  BUILDINGS: '/buildings',
  BUILDING_DETAIL: '/buildings/:id',
  RESULTS: '/buildings/:id/results',
  ADMIN: '/admin',
} as const;
