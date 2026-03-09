import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ListeningState = 'idle' | 'listening' | 'processing' | 'speaking';

const STATE_LABELS: Record<ListeningState, string> = {
  idle: '',
  listening: 'Listening…',
  processing: 'Processing…',
  speaking: 'Speaking…',
};

const BAR_COUNT = 5;
const BASE_HEIGHT = 6;
const MAX_HEIGHT = 32;

interface BarProps {
  index: number;
  state: ListeningState;
  color: string;
}

function AnimatedBar({ index, state, color }: BarProps) {
  const height = useRef(new Animated.Value(BASE_HEIGHT)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (state === 'listening' || state === 'speaking') {
      const delay = index * 120;
      const barMax = MAX_HEIGHT * (0.5 + 0.5 * Math.sin((index / BAR_COUNT) * Math.PI));
      animation = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(height, {
            toValue: barMax,
            duration: 400 + index * 60,
            useNativeDriver: false,
          }),
          Animated.timing(height, {
            toValue: BASE_HEIGHT,
            duration: 400 + index * 60,
            useNativeDriver: false,
          }),
        ]),
      );
      animation.start();
    } else if (state === 'processing') {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(height, {
            toValue: BASE_HEIGHT + 8,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(height, {
            toValue: BASE_HEIGHT,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
      );
      animation.start();
    } else {
      Animated.timing(height, {
        toValue: BASE_HEIGHT,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }

    return () => animation?.stop();
  }, [state, index, height]);

  const opacity = state === 'idle' ? 0.25 : 1;

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          height,
          backgroundColor: color,
          opacity,
        },
      ]}
    />
  );
}

interface ListeningIndicatorProps {
  state: ListeningState;
}

export default function ListeningIndicator({ state }: ListeningIndicatorProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const labelColor =
    state === 'processing'
      ? colors.warning
      : state === 'speaking'
        ? colors.tint
        : colors.textSecondary;

  const barColor =
    state === 'processing'
      ? colors.warning
      : state === 'speaking'
        ? colors.tint
        : colors.tint;

  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <AnimatedBar key={i} index={i} state={state} color={barColor} />
        ))}
      </View>
      {state !== 'idle' && (
        <ThemedText
          style={[Typography.footnote, styles.label, { color: labelColor }]}
        >
          {STATE_LABELS[state]}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: MAX_HEIGHT + 4,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  label: {
    letterSpacing: 0.2,
  },
});
