import { Platform } from 'react-native';

// Apple Health-inspired color palette
export const Colors = {
  light: {
    text: '#1C1C1E',
    textSecondary: '#8E8E93',
    textTertiary: '#AEAEB2',
    background: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceSecondary: '#F5F5F7',
    tint: '#007AFF',
    icon: '#8E8E93',
    tabIconDefault: '#8E8E93',
    tabIconSelected: '#007AFF',
    border: '#E5E5EA',
    borderLight: '#F0F0F2',
    destructive: '#FF3B30',
    success: '#34C759',
    warning: '#FF9500',
    caloriesAccent: '#FF2D55',
    proteinAccent: '#5856D6',
    carbsAccent: '#FF9500',
    fatAccent: '#30B0C7',
    progressTrack: '#E8E8ED',
    progressOverflow: '#FF3B30',
    overlay: 'rgba(0, 0, 0, 0.4)',
    sheetHandle: '#C7C7CC',
  },
  dark: {
    text: '#F2F2F7',
    textSecondary: '#8E8E93',
    textTertiary: '#636366',
    background: '#000000',
    surface: '#1C1C1E',
    surfaceSecondary: '#2C2C2E',
    tint: '#0A84FF',
    icon: '#8E8E93',
    tabIconDefault: '#8E8E93',
    tabIconSelected: '#0A84FF',
    border: '#38383A',
    borderLight: '#2C2C2E',
    destructive: '#FF453A',
    success: '#30D158',
    warning: '#FF9F0A',
    caloriesAccent: '#FF375F',
    proteinAccent: '#5E5CE6',
    carbsAccent: '#FF9F0A',
    fatAccent: '#40C8E0',
    progressTrack: '#2C2C2E',
    progressOverflow: '#FF453A',
    overlay: 'rgba(0, 0, 0, 0.6)',
    sheetHandle: '#48484A',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
});

export const Typography = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700' as const,
    letterSpacing: 0.37,
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: 0.36,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: 0.35,
  },
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600' as const,
    letterSpacing: 0.38,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.41,
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: -0.41,
  },
  callout: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400' as const,
    letterSpacing: -0.32,
  },
  subhead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: -0.24,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
    letterSpacing: -0.08,
  },
  caption1: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  caption2: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '400' as const,
    letterSpacing: 0.07,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};
