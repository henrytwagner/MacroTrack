import { create } from 'zustand';
import type { MacroLayoutId } from '@/components/DashboardMacroLayouts';

interface DashboardLayoutState {
  layoutId: MacroLayoutId;
  setLayoutId: (id: MacroLayoutId) => void;
}

export const useDashboardLayoutStore = create<DashboardLayoutState>((set) => ({
  layoutId: 'activity-rings',
  setLayoutId: (layoutId) => set({ layoutId }),
}));
