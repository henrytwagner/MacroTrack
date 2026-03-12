import { create } from 'zustand';
import type {
  DailyGoal,
  GoalForDateResponse,
  GoalProfileListItem,
  UpdateGoalsForDateRequest,
} from '@shared/types';
import * as api from '@/services/api';

interface GoalState {
  goalsByDate: Record<string, DailyGoal | null>;
  metaByDate: Record<string, GoalForDateResponse | null>;
  profiles: GoalProfileListItem[];
  isLoading: boolean;
  error: string | null;
  fetch: (date: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
  saveChange: (data: UpdateGoalsForDateRequest) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goalsByDate: {},
  metaByDate: {},
  profiles: [],
  isLoading: false,
  error: null,

  fetch: async (date: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.getGoalsForDate(date);
      set((state) => ({
        goalsByDate: { ...state.goalsByDate, [date]: res.goals },
        metaByDate: { ...state.metaByDate, [date]: res },
        isLoading: false,
      }));
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load goals',
      });
    }
  },

  refreshProfiles: async () => {
    try {
      const res = await api.getGoalProfiles();
      set({ profiles: res.profiles });
    } catch {
      // swallow; profiles are non-critical
    }
  },

  saveChange: async (data: UpdateGoalsForDateRequest) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.changeGoals(data);
      const date = res.date;
      set((state) => ({
        goalsByDate: { ...state.goalsByDate, [date]: res.goals },
        metaByDate: { ...state.metaByDate, [date]: res },
        isLoading: false,
      }));
      // Also refresh profiles so the list stays current
      const { refreshProfiles } = get();
      void refreshProfiles();
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to save goals',
      });
    }
  },
}));
