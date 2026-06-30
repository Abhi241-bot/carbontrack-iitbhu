import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/authStore';
import { UserRole } from '@shared/types/user.types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireRoles?: UserRole[];
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireRoles,
}: ProtectedRouteProps) {
  const { user, accessToken } = useAuthStore();
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== UserRole.ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireRoles && requireRoles.length > 0 && !requireRoles.includes(user.role as UserRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-sm">
          <p className="text-4xl font-bold text-gray-200 mb-3">403</p>
          <p className="text-lg font-semibold text-gray-700 mb-2">Access restricted</p>
          <p className="text-sm text-gray-500">
            This page requires {requireRoles.join(' or ')} access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
