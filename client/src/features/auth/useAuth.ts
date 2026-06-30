import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { authApi, RegisterData, LoginData } from './authApi';
import { useToast } from '../../hooks/useToast';
import { UserRole } from '@shared/types/user.types';

export function useLogin(from?: string) {
  const { setUser, setAccessToken } = useAuthStore();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  return useMutation({
    mutationFn: (data: LoginData) => authApi.login(data),
    onSuccess: (res) => {
      const { user, accessToken } = res.data.data;
      setUser(user);
      setAccessToken(accessToken);
      showSuccess('Welcome back!');
      if (user.role === UserRole.ADMIN) {
        navigate('/admin');
      } else {
        navigate(from || '/dashboard');
      }
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      showError(e.response?.data?.message || 'Login failed');
    },
  });
}

export function useRegister() {
  const navigate = useNavigate();
  const { showError } = useToast();

  return useMutation({
    mutationFn: (data: RegisterData) => authApi.register(data),
    onSuccess: () => {
      navigate('/login', { state: { registered: true } });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      showError(e.response?.data?.message || 'Registration failed');
    },
  });
}

export function useLogout() {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearAuth();
      showSuccess('Logged out successfully');
      navigate('/');
    },
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => authApi.forgotPassword(email) });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      authApi.resetPassword(token, password),
  });
}

export function useGetMe() {
  const { accessToken, setUser } = useAuthStore();

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await authApi.getMe();
      setUser(res.data.data);
      return res.data.data;
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
