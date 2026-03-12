import { create } from 'zustand';
import type { UserProfile } from '@shared/types';
import * as api from '@/services/api';

interface ProfileState {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  save: (data: Partial<UserProfile>) => Promise<void>;
}

const DEFAULT_PROFILE: UserProfile = {
  sex: 'UNSPECIFIED',
  preferredUnits: 'METRIC',
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const profile = await api.getProfile();
      set({ profile, isLoading: false });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to load profile',
      });
    }
  },

  save: async (data: Partial<UserProfile>) => {
    set({ isLoading: true, error: null });
    try {
      const current = get().profile ?? DEFAULT_PROFILE;
      // Merge so we only send defined values; undefined in data keeps current value (avoids overwriting with null)
      const payload: UserProfile = {
        sex: data.sex ?? current.sex,
        preferredUnits: data.preferredUnits ?? current.preferredUnits,
        heightCm: data.heightCm !== undefined ? data.heightCm : current.heightCm,
        weightKg: data.weightKg !== undefined ? data.weightKg : current.weightKg,
        dateOfBirth: data.dateOfBirth !== undefined ? data.dateOfBirth : current.dateOfBirth,
        activityLevel: data.activityLevel !== undefined ? data.activityLevel : current.activityLevel,
        currentGoalProfileId: current.currentGoalProfileId,
      };
      const saved = await api.updateProfile(payload);
      set({ profile: saved, isLoading: false });
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to save profile',
      });
    }
  },
}));

