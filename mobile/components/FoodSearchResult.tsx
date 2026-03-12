import { StyleSheet, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MacroInlineLine from '@/components/MacroInlineLine';
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
  const macros = isCustomFood(food)
    ? { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }
    : food.macros;
  const servingLabel = isCustomFood(food)
    ? `${food.servingSize} ${food.servingUnit}`
    : food.brandName
      ? food.brandName
      : `${food.servingSize ?? 100} ${food.servingSizeUnit ?? 'g'}`;

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
  },
  info: {
    flex: 1,
    gap: 4,
    marginRight: Spacing.sm,
  },
});
