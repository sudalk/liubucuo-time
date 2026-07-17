import { create } from "zustand";

interface ConfirmState {
  message: string | null;
  resolve: ((confirmed: boolean) => void) | null;
  ask: (message: string) => Promise<boolean>;
  close: (confirmed: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  message: null,
  resolve: null,
  ask: (message) => new Promise<boolean>((resolve) => {
    // 同一时间只保留一个确认动作，避免重复点击触发多层系统弹框。
    get().resolve?.(false);
    set({ message, resolve });
  }),
  close: (confirmed) => {
    const { resolve } = get();
    set({ message: null, resolve: null });
    resolve?.(confirmed);
  }
}));

export function confirmAction(message: string): Promise<boolean> {
  return useConfirmStore.getState().ask(message);
}
