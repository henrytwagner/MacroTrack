import { useState } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface MacroProgressBarProps {
  label: string;
  current: number;
  goal: number;
  accentColor: string;
  unit?: string;
}

export default function MacroProgressBar({
  label,
  current,
  goal,
  accentColor,
  unit = '',
}: MacroProgressBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [trackWidth, setTrackWidth] = useState(0);

  const percentage = goal > 0 ? current / goal : 0;
  const isOverflow = percentage > 1;
  const remaining = goal - current;

  const getOverflowColor = (baseColor: string): string => {
    // Expecting hex like #RRGGBB; fallback to baseColor if parsing fails
    if (!baseColor || !baseColor.startsWith('#') || baseColor.length !== 7) {
      return baseColor;
    }
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    const factor = 0.75; // 25% darker
    const toHex = (v: number) => {
      const clamped = Math.max(0, Math.min(255, Math.round(v * factor)));
      return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const overflowColor = getOverflowColor(accentColor);

  const remainingText =
    goal > 0
      ? remaining >= 0
        ? `${Math.round(remaining)}${unit} left`
        : `${Math.round(Math.abs(remaining))}${unit} over`
      : 'No goal set';

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const valueText = `${Math.round(current)} / ${goal > 0 ? goal : '—'}`;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText
          style={[
            Typography.subhead,
            styles.labelText,
            { color: colors.text, fontWeight: '600' },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label}
        </ThemedText>
        <ThemedText
          style={[
            Typography.subhead,
            styles.valueText,
            {
              color: isOverflow
                ? colors.progressOverflow
                : colors.textSecondary,
            },
          ]}
          numberOfLines={1}
        >
          {valueText}
        </ThemedText>
      </View>

      <View style={styles.barOuter}>
        <View
          style={[styles.track, { backgroundColor: colors.progressTrack }]}
          onLayout={handleLayout}
        />
        {trackWidth > 0 &&
          (isOverflow ? (
            <View style={styles.fillContainer}>
              <View
                style={[
                  styles.segment,
                  {
                    flex: goal,
                    backgroundColor: accentColor,
                  },
                ]}
              />
              <View
                style={[
                  styles.divider,
                  {
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              <View
                style={[
                  styles.segment,
                  {
                    flex: Math.max(current - goal, 0),
                    backgroundColor: overflowColor,
                  },
                ]}
              />
            </View>
          ) : (
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: accentColor,
                  width: trackWidth * Math.max(Math.min(percentage, 1), 0),
                },
              ]}
            />
          ))}
      </View>

      <ThemedText
        style={[
          Typography.caption1,
          {
            color: isOverflow
              ? colors.progressOverflow
              : colors.textSecondary,
          },
        ]}
      >
        {remainingText}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 0,
  },
  labelText: {
    flex: 1,
    minWidth: 0,
  },
  valueText: {
    flexShrink: 0,
    minWidth: 96,
    textAlign: 'right',
  },
  barOuter: {
    height: 8,
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  track: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: BorderRadius.sm,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: BorderRadius.sm,
  },
  fillContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
    minWidth: 0,
  },
  divider: {
    width: 2,
  },
});
