import { create } from 'zustand';
import { login as apiLogin, getMe } from '@/lib/api';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiLogin(email, password);
      localStorage.setItem('token', data.access_token);
      set({ token: data.access_token, isLoading: false });
      // Fetch user info
      const user = await getMe();
      set({ user });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const user = await getMe();
      set({ token, user });
    } catch {
      localStorage.removeItem('token');
      set({ token: null, user: null });
    }
  },
}));
