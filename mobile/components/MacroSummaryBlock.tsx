import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Typography, Spacing, BorderRadius } from '@/constants/theme';

export interface MacroSummaryBlockProps {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  colors: {
    caloriesAccent: string;
    proteinAccent: string;
    carbsAccent: string;
    fatAccent: string;
    textSecondary: string;
    surfaceSecondary?: string;
  };
  /** Optional background; defaults to surfaceSecondary */
  backgroundColor?: string;
}

/**
 * Compact 4-column nutrition summary (cal, protein, carbs, fat).
 * Used in add/edit food flow instead of a list view.
 */
export default function MacroSummaryBlock({
  calories,
  proteinG,
  carbsG,
  fatG,
  colors,
  backgroundColor,
}: MacroSummaryBlockProps) {
  const bg = backgroundColor ?? colors.surfaceSecondary ?? 'transparent';
  return (
    <View style={[styles.macroSummary, { backgroundColor: bg }]}>
      <View style={styles.macroItem}>
        <ThemedText style={[Typography.headline, { color: colors.caloriesAccent }]}>
          {calories}
        </ThemedText>
        <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>cal</ThemedText>
      </View>
      <View style={styles.macroItem}>
        <ThemedText style={[Typography.headline, { color: colors.proteinAccent }]}>
          {proteinG}g
        </ThemedText>
        <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>protein</ThemedText>
      </View>
      <View style={styles.macroItem}>
        <ThemedText style={[Typography.headline, { color: colors.carbsAccent }]}>
          {carbsG}g
        </ThemedText>
        <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>carbs</ThemedText>
      </View>
      <View style={styles.macroItem}>
        <ThemedText style={[Typography.headline, { color: colors.fatAccent }]}>
          {fatG}g
        </ThemedText>
        <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>fat</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  macroSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  macroItem: {
    alignItems: 'center',
    gap: 2,
  },
});
