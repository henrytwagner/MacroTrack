import { create } from 'zustand';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DateState {
  selectedDate: string;
  setDate: (date: string) => void;
  goToPreviousDay: () => void;
  goToNextDay: () => void;
}

export const useDateStore = create<DateState>((set, get) => ({
  selectedDate: todayString(),

  setDate: (date: string) => set({ selectedDate: date }),

  goToPreviousDay: () =>
    set({ selectedDate: addDays(get().selectedDate, -1) }),

  goToNextDay: () =>
    set({ selectedDate: addDays(get().selectedDate, 1) }),
}));

export { todayString };
