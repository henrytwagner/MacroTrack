import { useRef } from 'react';
import { StyleSheet, View, Pressable, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { FoodEntry } from '@shared/types';

interface FoodEntryRowProps {
  entry: FoodEntry;
  onPress: (entry: FoodEntry) => void;
  onDelete: (entry: FoodEntry) => void;
}

export default function FoodEntryRow({
  entry,
  onPress,
  onDelete,
}: FoodEntryRowProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });

    return (
      <Animated.View
        style={[styles.deleteAction, { transform: [{ translateX }] }]}
      >
        <Pressable
          style={[styles.deleteBtn, { backgroundColor: colors.destructive }]}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete(entry);
          }}
        >
          <MaterialIcons name="delete-outline" size={22} color="#fff" />
          <ThemedText style={styles.deleteText}>Delete</ThemedText>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        style={[styles.row, { backgroundColor: colors.surface }]}
        onPress={() => onPress(entry)}
      >
        <View style={styles.mainContent}>
          <ThemedText
            style={[Typography.body, { color: colors.text }]}
            numberOfLines={1}
          >
            {entry.name}
          </ThemedText>
          <View style={styles.details}>
            <ThemedText
              style={[Typography.caption1, { color: colors.textSecondary }]}
            >
              {entry.quantity}
              {entry.unit}
            </ThemedText>
            <ThemedText
              style={[Typography.caption1, { color: colors.textTertiary }]}
            >
              ·
            </ThemedText>
            <ThemedText
              style={[
                Typography.subhead,
                { color: colors.text, fontWeight: '500' },
              ]}
            >
              {Math.round(entry.calories)} cal
            </ThemedText>
          </View>
        </View>
        <MaterialIcons
          name={entry.source === 'CUSTOM' ? 'person-outline' : 'cloud-queue'}
          size={16}
          color={colors.textTertiary}
        />
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  mainContent: {
    flex: 1,
    gap: 2,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  deleteAction: {
    width: 80,
  },
  deleteBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
