import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MacroInlineLine from '@/components/MacroInlineLine';
import UndoSnackbar from '@/components/UndoSnackbar';
import type { CustomFood } from '@shared/types';
import * as api from '@/services/api';

interface CustomFoodListProps {
  visible: boolean;
  onClose: () => void;
  onEditFood: (food: CustomFood) => void;
  refreshKey?: number;
}

export default function CustomFoodList({
  visible,
  onClose,
  onEditFood,
  refreshKey,
}: CustomFoodListProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletedFood, setDeletedFood] = useState<CustomFood | null>(null);

  const fetchFoods = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getCustomFoods();
      setFoods(result);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) fetchFoods();
  }, [visible, fetchFoods, refreshKey]);

  const handleDelete = (food: CustomFood) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFoods((prev) => prev.filter((f) => f.id !== food.id));
    setDeletedFood(food);
  };

  const handleUndo = () => {
    if (deletedFood) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setFoods((prev) =>
        [...prev, deletedFood].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDeletedFood(null);
    }
  };

  const handleUndoDismiss = () => {
    if (deletedFood) {
      api.deleteCustomFood(deletedFood.id).catch(() => {});
      setDeletedFood(null);
    }
  };

  const confirmDelete = (food: CustomFood) => {
    Alert.alert(
      'Delete Custom Food',
      `Delete "${food.name}"? This cannot be undone after the undo window.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(food) },
      ],
    );
  };

  const renderItem = useCallback(
    ({ item }: { item: CustomFood }) => (
      <View style={[styles.foodRow, { backgroundColor: colors.surface }]}>
        <Pressable
          style={({ pressed }) => [
            styles.foodInfo,
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => onEditFood(item)}
        >
          <ThemedText
            style={[Typography.body, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </ThemedText>
          <MacroInlineLine
            prefix={`${item.servingSize} ${item.servingUnit}`}
            macros={item}
            colors={{
              ...colors,
              textSecondary: colors.textSecondary,
            }}
            textStyle="footnote"
          />
        </Pressable>
        <Pressable
          onPress={() => confirmDelete(item)}
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="trash-outline" size={20} color={colors.destructive} />
        </Pressable>
      </View>
    ),
    [colors, onEditFood],
  );

  if (!visible) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.tint} />
        </Pressable>
        <ThemedText style={[Typography.title3, { color: colors.text }]}>
          My Foods
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={colors.tint}
        />
      ) : foods.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="restaurant-outline"
            size={48}
            color={colors.textTertiary}
          />
          <ThemedText
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
            ]}
          >
            No custom foods yet. Create one from the Log tab.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={foods}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      <UndoSnackbar
        message={deletedFood ? `${deletedFood.name} deleted.` : ''}
        visible={!!deletedFood}
        onUndo={handleUndo}
        onDismiss={handleUndoDismiss}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  loader: {
    marginTop: Spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  list: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  foodInfo: {
    flex: 1,
    gap: 4,
    marginRight: Spacing.md,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
});
