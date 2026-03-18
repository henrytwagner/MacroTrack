import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Macros } from '@shared/types';

export interface MacroRingProgressProps {
  totals: Macros;
  goals: Macros | null;
  variant?: 'compact' | 'default' | 'dashboard';
  /** Show calorie total (e.g. "1200 / 2000") below the rings when true. */
  showCalorieSummary?: boolean;
  /** @deprecated Use showCalorieSummary. Kept for compatibility. */
  showCenterLabel?: boolean;
  /** Tighter vertical spacing between rings and calorie summary. */
  tightSpacing?: boolean;
}

const MACRO_KEYS = ['calories', 'proteinG', 'carbsG', 'fatG'] as const;
const MACRO_LABELS: Record<(typeof MACRO_KEYS)[number], string> = {
  calories: 'Cal',
  proteinG: 'P',
  carbsG: 'C',
  fatG: 'F',
};

function getOverflowColor(baseColor: string): string {
  if (!baseColor || !baseColor.startsWith('#') || baseColor.length !== 7) {
    return baseColor;
  }
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);
  const factor = 0.75;
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface SingleRingProps {
  size: number;
  strokeWidth: number;
  current: number;
  goal: number;
  accentColor: string;
  trackColor: string;
  label?: string;
  showLabel?: boolean;
  labelColor?: string;
}

function SingleMacroRing({
  size,
  strokeWidth,
  current,
  goal,
  accentColor,
  trackColor,
  label,
  showLabel,
  labelColor,
}: SingleRingProps) {
  const circumference = 2 * Math.PI * (size / 2 - strokeWidth / 2);
  const progress = goal > 0 ? current / goal : 0;
  const isOverflow = progress > 1;
  const fillLength = Math.min(progress, 1) * circumference;
  const overflowLength = isOverflow ? (progress - 1) * circumference : 0;
  const overflowColor = getOverflowColor(accentColor);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - strokeWidth / 2;

  return (
    <View style={[styles.singleRingWrap, { width: size, height: size + (showLabel ? 18 : 0) }]}>
      <View style={{ width: size, height: size }}>
        {/* Track */}
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
        {/* Fill: up to 100% in accent */}
        {fillLength > 0 && (
          <Svg width={size} height={size} style={{ position: 'absolute' }}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={accentColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${fillLength} ${circumference - fillLength}`}
              strokeLinecap="round"
            />
          </Svg>
        )}
        {/* Overflow: beyond 100% in darker color */}
        {overflowLength > 0 && (
          <Svg width={size} height={size} style={{ position: 'absolute' }}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={overflowColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${overflowLength} ${circumference - overflowLength}`}
              strokeDashoffset={-fillLength}
              strokeLinecap="round"
            />
          </Svg>
        )}
      </View>
      {showLabel && label !== undefined && (
        <ThemedText
          style={[Typography.caption2, styles.ringLabel, labelColor ? { color: labelColor } : undefined]}
          numberOfLines={1}
        >
          {label}
        </ThemedText>
      )}
    </View>
  );
}

export default function MacroRingProgress({
  totals,
  goals,
  variant = 'default',
  showCalorieSummary,
  showCenterLabel,
  tightSpacing,
}: MacroRingProgressProps) {
  const showCal = showCalorieSummary ?? showCenterLabel ?? true;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const ringSize =
    variant === 'compact' ? 32 : variant === 'dashboard' ? 56 : 44;
  const strokeWidth = variant === 'compact' ? 3 : variant === 'dashboard' ? 6 : 4;
  const showLabels = variant !== 'compact';

  const accentColors = [
    colors.caloriesAccent,
    colors.proteinAccent,
    colors.carbsAccent,
    colors.fatAccent,
  ];

  const items = useMemo(() => {
    return MACRO_KEYS.map((key, i) => {
      const current = key === 'calories' ? totals.calories : totals[key];
      const goal = goals
        ? key === 'calories'
          ? goals.calories
          : goals[key]
        : 0;
      return {
        key,
        label: MACRO_LABELS[key],
        current,
        goal,
        color: accentColors[i],
      };
    });
  }, [totals, goals, accentColors]);

  const calorieSummary =
    goals !== null
      ? `${Math.round(totals.calories)} / ${goals.calories} cal`
      : `${Math.round(totals.calories)} cal`;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.ringsRow, tightSpacing && styles.ringsRowTight]}>
        {items.map((item) => (
          <SingleMacroRing
            key={item.key}
            size={ringSize}
            strokeWidth={strokeWidth}
            current={item.current}
            goal={item.goal}
            accentColor={item.color}
            trackColor={colors.progressTrack}
            label={item.label}
            showLabel={showLabels}
            labelColor={colors.textSecondary}
          />
        ))}
      </View>
      {showCal && (
        <ThemedText
          style={[
            Typography.footnote,
            { color: colors.textSecondary, marginTop: tightSpacing ? 2 : Spacing.xs },
          ]}
          numberOfLines={1}
        >
          {calorieSummary}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  ringsRowTight: {
    gap: Spacing.xs,
  },
  singleRingWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringLabel: {
    marginTop: 4,
    textAlign: 'center',
  },
});

export { MACRO_LABELS };
