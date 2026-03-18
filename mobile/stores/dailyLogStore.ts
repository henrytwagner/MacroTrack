import { create } from 'zustand';
import type { FoodEntry, MealLabel, Macros } from '@shared/types';
import * as api from '@/services/api';

function groupByMeal(entries: FoodEntry[]): Record<MealLabel, FoodEntry[]> {
  const groups: Record<MealLabel, FoodEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const entry of entries) {
    groups[entry.mealLabel].push(entry);
  }
  return groups;
}

function computeTotals(entries: FoodEntry[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      proteinG: acc.proteinG + e.proteinG,
      carbsG: acc.carbsG + e.carbsG,
      fatG: acc.fatG + e.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

function recalculate(entries: FoodEntry[]) {
  return {
    entries,
    entriesByMeal: groupByMeal(entries),
    totals: computeTotals(entries),
  };
}

interface DailyLogState {
  entries: FoodEntry[];
  entriesByMeal: Record<MealLabel, FoodEntry[]>;
  totals: Macros;
  isLoading: boolean;
  error: string | null;
  fetch: (date: string) => Promise<void>;
  addEntry: (entry: FoodEntry) => void;
  removeEntry: (id: string) => FoodEntry | undefined;
  restoreEntry: (entry: FoodEntry) => void;
  commitDelete: (id: string) => Promise<void>;
}

export const useDailyLogStore = create<DailyLogState>((set, get) => ({
  entries: [],
  entriesByMeal: { breakfast: [], lunch: [], dinner: [], snack: [] },
  totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  isLoading: false,
  error: null,

  fetch: async (date: string) => {
    set({ isLoading: true, error: null });
    try {
      const entries = await api.getEntries(date);
      set({ ...recalculate(entries), isLoading: false });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load entries',
      });
    }
  },

  addEntry: (entry: FoodEntry) => {
    const { entries } = get();
    const updated = [...entries, entry].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    set(recalculate(updated));
  },

  removeEntry: (id: string) => {
    const { entries } = get();
    const removed = entries.find((e) => e.id === id);
    if (!removed) return undefined;
    const remaining = entries.filter((e) => e.id !== id);
    set(recalculate(remaining));
    return removed;
  },

  restoreEntry: (entry: FoodEntry) => {
    const { entries } = get();
    const updated = [...entries, entry].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    set(recalculate(updated));
  },

  commitDelete: async (id: string) => {
    await api.deleteEntry(id);
  },
}));
