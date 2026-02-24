import { useEffect, useRef } from 'react';
import { StyleSheet, Pressable, Animated } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface UndoSnackbarProps {
  message: string;
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export default function UndoSnackbar({
  message,
  visible,
  onUndo,
  onDismiss,
  duration = 5000,
}: UndoSnackbarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const translateY = useRef(new Animated.Value(100)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();

      timerRef.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }).start(() => onDismiss());
      }, duration);
    } else {
      Animated.timing(translateY, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colorScheme === 'dark' ? colors.surfaceSecondary : '#323232',
          transform: [{ translateY }],
        },
      ]}
    >
      <ThemedText
        style={[Typography.subhead, { color: '#FFFFFF', flex: 1 }]}
        numberOfLines={1}
      >
        {message}
      </ThemedText>
      <Pressable onPress={onUndo} hitSlop={8}>
        <ThemedText
          style={[
            Typography.headline,
            { color: colors.tint },
          ]}
        >
          UNDO
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
});
