import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { FrequentFood, RecentFood } from '@shared/types';

type FoodItem = FrequentFood | RecentFood;

function isFrequent(item: FoodItem): item is FrequentFood {
  return 'logCount' in item;
}

interface FrequentFoodRowProps {
  food: FoodItem;
  onPressName: (food: FoodItem) => void;
  onQuickAdd: (food: FoodItem) => void;
}

export default function FrequentFoodRow({
  food,
  onPressName,
  onQuickAdd,
}: FrequentFoodRowProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const qty = isFrequent(food) ? food.lastQuantity : food.quantity;
  const unit = isFrequent(food) ? food.lastUnit : food.unit;

  const handleQuickAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onQuickAdd(food);
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <Pressable
        style={({ pressed }) => [
          styles.nameArea,
          pressed && { opacity: 0.6 },
        ]}
        onPress={() => onPressName(food)}
      >
        <ThemedText
          style={[Typography.body, { color: colors.text }]}
          numberOfLines={1}
        >
          {food.name}
        </ThemedText>
        <ThemedText
          style={[Typography.footnote, { color: colors.textSecondary }]}
        >
          {qty} {unit} · {Math.round(food.macros.calories)} cal
        </ThemedText>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: colors.tint },
          pressed && { opacity: 0.7 },
        ]}
        onPress={handleQuickAdd}
        hitSlop={8}
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  nameArea: {
    flex: 1,
    gap: 2,
    marginRight: Spacing.md,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
