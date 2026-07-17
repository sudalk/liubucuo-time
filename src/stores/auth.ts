import { create } from "zustand";
import { api, type User } from "../api/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;

  init: () => Promise<void>;
  requestCode: (email: string) => Promise<{ ok: boolean; error?: string }>;
  verifyCode: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  init: async () => {
    try {
      await api.initMobileSession();
      const { user } = await api.get<{ user: User | null }>("/api/auth/me");
      set({ user, initialized: true });
    } catch {
      set({ user: null, initialized: true });
    }
  },

  requestCode: async (email) => {
    set({ loading: true });
    try {
      await api.post("/api/auth/request-code", { email });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      set({ loading: false });
    }
  },

  verifyCode: async (email, code) => {
    set({ loading: true });
    try {
      const { user, token } = await api.post<{ ok: boolean; user: User; token?: string }>("/api/auth/verify-code", { email, code });
      await api.setMobileSession(token);
      set({ user });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      await api.post("/api/auth/logout", {});
    } catch {
      // ignore
    } finally {
      await api.clearMobileSession();
    }
    set({ user: null });
  }
}));
