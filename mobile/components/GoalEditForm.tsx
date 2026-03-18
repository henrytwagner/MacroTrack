import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type ThemeColors = (typeof Colors)['light'];

const ROWS: Array<{
  key: 'calories' | 'protein' | 'carbs' | 'fat';
  label: string;
  unit: string;
  accentKey: 'caloriesAccent' | 'proteinAccent' | 'carbsAccent' | 'fatAccent';
}> = [
  { key: 'calories', label: 'Calories', unit: 'kcal', accentKey: 'caloriesAccent' },
  { key: 'protein', label: 'Protein', unit: 'g', accentKey: 'proteinAccent' },
  { key: 'carbs', label: 'Carbs', unit: 'g', accentKey: 'carbsAccent' },
  { key: 'fat', label: 'Fat', unit: 'g', accentKey: 'fatAccent' },
];

export interface GoalEditFormValues {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

export interface GoalEditFormProps {
  values: GoalEditFormValues;
  onChange: (values: GoalEditFormValues) => void;
  colors: ThemeColors;
}

export function GoalEditForm({ values, onChange, colors }: GoalEditFormProps) {
  const set = (key: keyof GoalEditFormValues, text: string) => {
    onChange({ ...values, [key]: text });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {ROWS.map((row, index) => (
        <View key={row.key}>
          {index > 0 && (
            <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
          )}
          <View style={styles.row}>
            <View style={[styles.labelWrap, { flex: 1 }]}>
              <View style={[styles.accentDot, { backgroundColor: colors[row.accentKey] }]} />
              <ThemedText style={[Typography.subhead, { color: colors.text }]}>
                {row.label}
              </ThemedText>
            </View>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border },
              ]}
              value={values[row.key]}
              onChangeText={(text) => set(row.key, text)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
            />
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary, minWidth: 28 }]}>
              {row.unit}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  labelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  input: {
    minWidth: 72,
    maxWidth: 88,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    textAlign: 'right',
    ...Typography.body,
    fontSize: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 0,
  },
});
