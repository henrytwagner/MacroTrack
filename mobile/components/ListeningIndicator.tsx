import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ListeningState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused';

const STATE_LABELS: Record<ListeningState, string> = {
  idle: '',
  listening: 'Listening…',
  processing: 'Processing…',
  speaking: 'Speaking…',
  paused: 'Paused',
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

  const opacity = state === 'idle' || state === 'paused' ? 0.25 : 1;

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
  /** When provided, the indicator is tappable to pause/resume listening. */
  onPress?: () => void;
  /** Optional: hide the text label, showing only the animated bars. Defaults to false. */
  showLabel?: boolean;
}

export default function ListeningIndicator({
  state,
  onPress,
  showLabel = true,
}: ListeningIndicatorProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const labelColor =
    state === 'processing'
      ? colors.warning
      : state === 'speaking'
        ? colors.tint
        : state === 'paused'
          ? colors.textTertiary
          : colors.textSecondary;

  const barColor =
    state === 'processing'
      ? colors.warning
      : state === 'speaking'
        ? colors.tint
      : state === 'paused'
        ? colors.textTertiary
        : colors.tint;

  const content = (
    <>
      <View style={styles.bars}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <AnimatedBar key={i} index={i} state={state} color={barColor} />
        ))}
      </View>
      {state !== 'idle' && showLabel && (
        <ThemedText
          style={[Typography.footnote, styles.label, { color: labelColor }]}
        >
          {state === 'paused' ? 'Tap to resume' : STATE_LABELS[state]}
        </ThemedText>
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.container}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={state === 'paused' ? 'Resume listening' : 'Pause listening'}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.container}>{content}</View>;
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
