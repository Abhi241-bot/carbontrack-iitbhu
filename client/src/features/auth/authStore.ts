import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IUser } from '@shared/types/user.types';

interface AuthState {
  user: IUser | null;
  accessToken: string | null;
  isLoading: boolean;
  setUser: (user: IUser | null) => void;
  setAccessToken: (token: string | null) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
    }
  )
);
