import { create } from 'zustand';
import type { DailyGoal, UpdateGoalsRequest } from '@shared/types';
import * as api from '@/services/api';

interface GoalState {
  goals: DailyGoal | null;
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  save: (data: UpdateGoalsRequest) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set) => ({
  goals: null,
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const goals = await api.getGoals();
      set({ goals, isLoading: false });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load goals',
      });
    }
  },

  save: async (data: UpdateGoalsRequest) => {
    set({ isLoading: true, error: null });
    try {
      const goals = await api.updateGoals(data);
      set({ goals, isLoading: false });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to save goals',
      });
    }
  },
}));
