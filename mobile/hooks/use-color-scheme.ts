import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { useAppearanceStore } from '@/stores/appearanceStore';

export function useColorScheme(): 'light' | 'dark' {
  const appearance = useAppearanceStore((s) => s.appearance);
  const deviceScheme = useDeviceColorScheme();

  if (appearance === 'light') return 'light';
  if (appearance === 'dark') return 'dark';
  return deviceScheme ?? 'light';
}
