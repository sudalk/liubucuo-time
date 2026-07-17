import { create } from "zustand";
import { api, type ActiveTimer, type EventItem } from "../api/client";

// 避免页面初始化的旧请求在稍后返回时，覆盖用户刚刚开始/结束的本地状态。
let timerMutationVersion = 0;

interface TimerState {
  // 计时器
  activeTimer: ActiveTimer | null;
  selectedEvent: EventItem | null;
  statusProgress: number;
  loading: boolean;
  error: string | null;

  // 动作
  setSelectedEvent: (event: EventItem | null) => void;
  setStatusProgress: (value: number) => void;
  fetchActive: () => Promise<void>;
  start: (eventName: string) => Promise<void>;
  stop: () => Promise<void>;
  patchStatus: () => Promise<void>;
  clearError: () => void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  activeTimer: null,
  selectedEvent: null,
  statusProgress: 90,
  loading: false,
  error: null,

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  setStatusProgress: (value) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    set((state) => ({
      statusProgress: clamped,
      activeTimer: state.activeTimer ? { ...state.activeTimer, statusProgress: clamped } : null
    }));
  },

  fetchActive: async () => {
    const versionAtRequest = timerMutationVersion;
    try {
      const { timer } = await api.get<{ timer: ActiveTimer | null }>("/api/records/active");
      if (versionAtRequest !== timerMutationVersion) return;
      set({ activeTimer: timer });
      if (timer) {
        set({ statusProgress: timer.statusProgress });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  start: async (eventName) => {
    const { statusProgress } = get();
    const startUtc = new Date().toISOString();
    const mutationVersion = ++timerMutationVersion;
    // 先更新本地，钟表与按钮无需等待远端往返。
    set({
      loading: false,
      error: null,
      activeTimer: { userId: "local", eventName, normalizedName: eventName.trim().toLowerCase(), startUtc, startLocal: startUtc, statusProgress }
    });
    void api.post<{ timer: ActiveTimer }>("/api/records/start", { eventName, statusProgress })
      .then(({ timer }) => {
        if (mutationVersion !== timerMutationVersion) return;
        // 服务端从收到请求那一刻开始记录，通常会比点击时晚几百毫秒。
        // 不用它替换本地秒表的基准，避免 1 秒后视觉上重新归零。
        set({
          activeTimer: {
            ...timer,
            startUtc,
            startLocal: get().activeTimer?.startLocal ?? timer.startLocal
          },
          statusProgress: timer.statusProgress
        });
      })
      .catch((err) => {
        if (mutationVersion !== timerMutationVersion) return;
        set({ activeTimer: null, error: err instanceof Error ? err.message : String(err) });
      });
  },

  stop: async () => {
    const previousTimer = get().activeTimer;
    const mutationVersion = ++timerMutationVersion;
    set({ loading: false, error: null, activeTimer: null, selectedEvent: null, statusProgress: 90 });
    void api.post("/api/records/stop", {})
      .catch((err) => {
        if (mutationVersion !== timerMutationVersion) return;
        set({ activeTimer: previousTimer, error: err instanceof Error ? err.message : String(err) });
      });
  },

  patchStatus: async () => {
    const { activeTimer, statusProgress } = get();
    if (!activeTimer) return;
    try {
      await api.patch("/api/records/active/status", { statusProgress });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError: () => set({ error: null })
}));
