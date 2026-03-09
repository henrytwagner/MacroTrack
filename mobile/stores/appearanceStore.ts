import { create } from 'zustand';

export type AppearanceMode = 'system' | 'light' | 'dark';

interface AppearanceState {
  appearance: AppearanceMode;
  setAppearance: (mode: AppearanceMode) => void;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  appearance: 'system',
  setAppearance: (appearance) => set({ appearance }),
}));
