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

  const remainingText =
    goal > 0
      ? remaining >= 0
        ? `${Math.round(remaining)}${unit} left`
        : `${Math.round(Math.abs(remaining))}${unit} over`
      : 'No goal set';

  const fillPct = Math.min(percentage, 1.5);
  const fillWidth = trackWidth > 0 ? fillPct * trackWidth : 0;

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText
          style={[
            Typography.subhead,
            { color: colors.text, fontWeight: '600' },
          ]}
        >
          {label}
        </ThemedText>
        <ThemedText
          style={[
            Typography.subhead,
            {
              color: isOverflow
                ? colors.progressOverflow
                : colors.textSecondary,
            },
          ]}
        >
          {Math.round(current)} / {goal > 0 ? goal : '—'}
        </ThemedText>
      </View>

      <View style={styles.barOuter}>
        <View
          style={[styles.track, { backgroundColor: colors.progressTrack }]}
          onLayout={handleLayout}
        />
        {trackWidth > 0 && (
          <View
            style={[
              styles.fill,
              {
                backgroundColor: isOverflow
                  ? colors.progressOverflow
                  : accentColor,
                width: fillWidth,
              },
            ]}
          />
        )}
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
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barOuter: {
    height: 8,
    position: 'relative',
    overflow: 'visible',
    marginRight: 40,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: BorderRadius.sm,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: BorderRadius.sm,
  },
});
