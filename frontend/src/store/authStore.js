import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      organization: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, organization, accessToken, refreshToken }) =>
        set({ user, organization, accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, organization: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'retainiq-auth' }
  )
);
