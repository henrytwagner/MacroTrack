import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { USDASearchResult, CustomFood } from '@shared/types';

type SearchItem = USDASearchResult | CustomFood;

function isCustomFood(item: SearchItem): item is CustomFood {
  return 'servingSize' in item && 'servingUnit' in item;
}

interface FoodSearchResultProps {
  food: SearchItem;
  onPress: (food: SearchItem) => void;
}

export default function FoodSearchResult({
  food,
  onPress,
}: FoodSearchResultProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const name = isCustomFood(food) ? food.name : food.description;
  const cals = isCustomFood(food) ? food.calories : food.macros.calories;
  const subtitle = isCustomFood(food)
    ? `${food.servingSize} ${food.servingUnit} · ${Math.round(cals)} cal`
    : food.brandName
      ? `${food.brandName} · ${Math.round(cals)} cal`
      : `${Math.round(cals)} cal per serving`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface },
        pressed && { opacity: 0.6 },
      ]}
      onPress={() => onPress(food)}
    >
      <View style={styles.info}>
        <ThemedText
          style={[Typography.body, { color: colors.text }]}
          numberOfLines={1}
        >
          {name}
        </ThemedText>
        <ThemedText
          style={[Typography.footnote, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {subtitle}
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
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
  info: {
    flex: 1,
    gap: 2,
    marginRight: Spacing.sm,
  },
});
