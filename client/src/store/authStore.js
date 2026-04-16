// client/src/store/authStore.js

import { create } from 'zustand';
import api from '../lib/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('rekker_token') || null,
  loading: true,

  login: async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    const { token, user } = res.data;
    localStorage.setItem('rekker_token', token);
    set({ token, user });
    return user;
  },

  logout: () => {
    localStorage.removeItem('rekker_token');
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/auth/me');
      set({ user: res.data.user, loading: false });
    } catch {
      set({ user: null, token: null, loading: false });
      localStorage.removeItem('rekker_token');
    }
  },

  hasRole: (...roles) => {
    const user = get().user;
    return user ? roles.includes(user.role) : false;
  },
}));
