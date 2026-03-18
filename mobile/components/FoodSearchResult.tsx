import { StyleSheet, View, Pressable } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

import { useColorScheme } from '@/hooks/use-color-scheme';
import MacroInlineLine from '@/components/MacroInlineLine';
import type { USDASearchResult, CustomFood, CommunityFood } from '@shared/types';

export type SearchItem = USDASearchResult | CustomFood | CommunityFood;

export function isCustomFood(item: SearchItem): item is CustomFood {
  return 'servingSize' in item && 'servingUnit' in item && !('defaultServingSize' in item);
}

export function isCommunityFood(item: SearchItem): item is CommunityFood {
  return 'defaultServingSize' in item && 'trustScore' in item;
}

interface FoodSearchResultProps {
  food: SearchItem;
  onPress: (food: SearchItem) => void;
  onQuickAdd?: (food: SearchItem) => void;
}

export default function FoodSearchResult({
  food,
  onPress,
  onQuickAdd,
}: FoodSearchResultProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const name = isCommunityFood(food)
    ? (food.brandName ? `${food.brandName} — ${food.name}` : food.name)
    : isCustomFood(food)
      ? food.name
      : food.description;
  const macros = isCommunityFood(food) || isCustomFood(food)
    ? { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }
    : food.macros;
  const servingLabel = isCommunityFood(food)
    ? `${food.defaultServingSize} ${food.defaultServingUnit}`
    : isCustomFood(food)
      ? `${food.servingSize} ${food.servingUnit}`
      : food.brandName
        ? food.brandName
        : `${food.servingSize ?? 100} ${food.servingSizeUnit ?? 'g'}`;

  const isUsda = !isCommunityFood(food) && !isCustomFood(food);

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
        <MacroInlineLine
          prefix={servingLabel}
          macros={macros}
          colors={{
            ...colors,
            textSecondary: colors.textSecondary,
          }}
          textStyle="footnote"
        />
        {isUsda && (
          <View style={[styles.usdaBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <ThemedText style={[Typography.caption2, { color: colors.textSecondary }]}>
              USDA
            </ThemedText>
          </View>
        )}
      </View>
      {onQuickAdd && (
        <Pressable
          onPress={() => onQuickAdd(food)}
          hitSlop={8}
          style={({ pressed }) => [styles.quickAddButton, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add" size={20} color={colors.tint} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  info: {
    flex: 1,
    gap: 4,
    marginRight: Spacing.sm,
  },
  quickAddButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  usdaBadge: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
