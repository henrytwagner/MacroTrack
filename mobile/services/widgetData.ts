/**
 * Writes today's macro progress and layout preference to shared storage (App Group)
 * so the iOS home screen widget can display them. No-op on Android.
 */
import { Platform } from 'react-native';
import type { Macros } from '@shared/types';
import type { MacroLayoutId } from '@/components/DashboardMacroLayouts';

export interface WidgetPayload {
  layoutId: MacroLayoutId;
  totals: Macros;
  goals: Macros | null;
  date: string;
}

const WIDGET_DATA_KEY = 'widgetData';

/** App Group must match app.json ios.entitlements and targets/widget/expo-target.config.js */
const APP_GROUP_ID = 'group.com.henrywagner.macrotrack.widget';

let _storage: import('@bacons/apple-targets').ExtensionStorage | null = null;

function getStorage(): typeof _storage {
  if (Platform.OS !== 'ios') return null;
  if (_storage != null) return _storage;
  try {
    const { ExtensionStorage } = require('@bacons/apple-targets');
    _storage = new ExtensionStorage(APP_GROUP_ID);
    return _storage;
  } catch {
    return null;
  }
}

/**
 * Write payload to App Group and ask WidgetKit to reload the widget.
 * Call after fetching today's entries/goals or when the user changes the dashboard layout.
 */
export function writeWidgetData(payload: WidgetPayload): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.set(WIDGET_DATA_KEY, JSON.stringify(payload));
    const { ExtensionStorage } = require('@bacons/apple-targets');
    ExtensionStorage.reloadWidget();
  } catch {
    // ExtensionStorage may be unavailable in Expo Go or when widget target is not built
  }
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Build payload from current stores (for today) and write to widget.
 * Use from dashboard after fetch or from edit-dashboard after layout change.
 */
export function writeWidgetDataFromStores(): void {
  const today = todayString();
  const { layoutId } = require('@/stores/dashboardLayoutStore').useDashboardLayoutStore.getState();
  const { entries, totals } = require('@/stores/dailyLogStore').useDailyLogStore.getState();
  const { goalsByDate } = require('@/stores/goalStore').useGoalStore.getState();
  const goals = goalsByDate[today] ?? null;
  // Only write if the store has data for today (entries are for selected date; we use totals for current store state)
  const dateMatch = require('@/stores/dateStore').useDateStore.getState().selectedDate === today;
  const payload: WidgetPayload = {
    layoutId,
    totals: dateMatch ? totals : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    goals,
    date: today,
  };
  writeWidgetData(payload);
}
