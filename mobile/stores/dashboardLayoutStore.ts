import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MacroLayoutId } from '@/components/DashboardMacroLayouts';

const LAYOUT_STORAGE_KEY = 'dashboardLayoutId';

const VALID_LAYOUT_IDS: MacroLayoutId[] = ['bars', 'nested-rings', 'activity-rings'];
function isValidLayoutId(value: string): value is MacroLayoutId {
  return VALID_LAYOUT_IDS.includes(value as MacroLayoutId);
}

interface DashboardLayoutState {
  layoutId: MacroLayoutId;
  _hydrated: boolean;
  setLayoutId: (id: MacroLayoutId) => void;
  hydrate: () => Promise<void>;
}

export const useDashboardLayoutStore = create<DashboardLayoutState>((set, get) => ({
  layoutId: 'activity-rings',
  _hydrated: false,

  setLayoutId: (layoutId) => {
    set({ layoutId });
    void AsyncStorage.setItem(LAYOUT_STORAGE_KEY, layoutId);
  },

  hydrate: async () => {
    if (get()._hydrated) return;
    try {
      const stored = await AsyncStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored != null && isValidLayoutId(stored)) {
        set({ layoutId: stored });
      }
    } catch {
      // ignore; keep default
    }
    set({ _hydrated: true });
  },
}));
