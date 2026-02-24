import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import FoodEntryRow from './FoodEntryRow';
import type { FoodEntry, MealLabel } from '@shared/types';

const MEAL_TITLES: Record<MealLabel, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

interface MealGroupProps {
  meal: MealLabel;
  entries: FoodEntry[];
  onPressEntry: (entry: FoodEntry) => void;
  onDeleteEntry: (entry: FoodEntry) => void;
}

export default function MealGroup({
  meal,
  entries,
  onPressEntry,
  onDeleteEntry,
}: MealGroupProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (entries.length === 0) return null;

  const mealCalories = entries.reduce((sum, e) => sum + e.calories, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText
          style={[Typography.title3, { color: colors.text }]}
        >
          {MEAL_TITLES[meal]}
        </ThemedText>
        <ThemedText
          style={[Typography.subhead, { color: colors.textSecondary }]}
        >
          {Math.round(mealCalories)} cal
        </ThemedText>
      </View>
      <View
        style={[
          styles.entriesCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
          },
        ]}
      >
        {entries.map((entry, i) => (
          <View key={entry.id}>
            {i > 0 && (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: colors.borderLight },
                ]}
              />
            )}
            <FoodEntryRow
              entry={entry}
              onPress={onPressEntry}
              onDelete={onDeleteEntry}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  entriesCard: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
});
