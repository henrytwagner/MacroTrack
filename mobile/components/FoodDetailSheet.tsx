import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { USDASearchResult, CustomFood, NutritionUnit, FoodEntry, MealLabel } from '@shared/types';
import * as api from '@/services/api';

const UNITS: NutritionUnit[] = ['g', 'oz', 'cups', 'servings', 'slices', 'pieces'];

type FoodDetailMode = 'add' | 'edit';

interface FoodDetailSheetProps {
  food: USDASearchResult | CustomFood | null;
  mode: FoodDetailMode;
  existingEntry?: FoodEntry;
  selectedDate?: string;
  onDismiss: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}

function isCustomFood(food: USDASearchResult | CustomFood): food is CustomFood {
  return 'servingSize' in food && 'servingUnit' in food;
}

function getMealLabel(): MealLabel {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

export default function FoodDetailSheet({
  food,
  mode,
  existingEntry,
  selectedDate,
  onDismiss,
  onSaved,
  onDeleted,
}: FoodDetailSheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['92%'], []);

  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<string>('servings');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (existingEntry) {
      setQuantity(String(existingEntry.quantity));
      setUnit(existingEntry.unit);
    } else if (food && isCustomFood(food)) {
      setQuantity(String(food.servingSize));
      setUnit(food.servingUnit);
    } else if (food) {
      setQuantity(food.servingSize ? String(food.servingSize) : '100');
      setUnit(food.servingSizeUnit || 'g');
    }
  }, [food, existingEntry]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.4}
      />
    ),
    [],
  );

  const macros = useMemo(() => {
    if (!food) return null;
    return isCustomFood(food)
      ? { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }
      : food.macros;
  }, [food]);

  const extendedNutrition = useMemo(() => {
    if (!food || !isCustomFood(food)) return null;
    const fields = [
      { label: 'Sodium', value: food.sodiumMg, unit: 'mg' },
      { label: 'Cholesterol', value: food.cholesterolMg, unit: 'mg' },
      { label: 'Fiber', value: food.fiberG, unit: 'g' },
      { label: 'Sugar', value: food.sugarG, unit: 'g' },
      { label: 'Saturated Fat', value: food.saturatedFatG, unit: 'g' },
      { label: 'Trans Fat', value: food.transFatG, unit: 'g' },
    ].filter((f) => f.value != null);
    return fields.length > 0 ? fields : null;
  }, [food]);

  const handleAdd = async () => {
    if (!food || !macros) return;
    setIsSaving(true);

    const custom = isCustomFood(food);
    const date = selectedDate || new Date().toISOString().split('T')[0];

    try {
      await api.createEntry({
        date,
        name: custom ? food.name : food.description,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatG: macros.fatG,
        quantity: Number(quantity) || 1,
        unit,
        source: custom ? 'CUSTOM' : 'DATABASE',
        mealLabel: getMealLabel(),
        usdaFdcId: custom ? undefined : food.fdcId,
        customFoodId: custom ? food.id : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.();
      sheetRef.current?.close();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!existingEntry) return;
    setIsSaving(true);
    try {
      await api.updateEntry(existingEntry.id, {
        quantity: Number(quantity) || 1,
        unit,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.();
      sheetRef.current?.close();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEntry) return;
    setIsDeleting(true);
    try {
      await api.deleteEntry(existingEntry.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDeleted?.();
      sheetRef.current?.close();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!food) return null;

  const foodName = isCustomFood(food) ? food.name : food.description;
  const sourceLabel = isCustomFood(food) ? 'Custom Food' : 'USDA Database';

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.sheetHandle }}
    >
      <ScrollView
        style={styles.sheetContent}
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.foodHeader}>
          <ThemedText style={[Typography.title2, { color: colors.text }]}>
            {foodName}
          </ThemedText>
          <View style={[styles.sourceBadge, { backgroundColor: colors.surfaceSecondary }]}>
            <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
              {sourceLabel}
            </ThemedText>
          </View>
        </View>

        {macros && (
          <View style={[styles.nutritionCard, { backgroundColor: colors.surfaceSecondary }]}>
            <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
              Nutrition per serving
            </ThemedText>
            <NutrientRow label="Calories" value={macros.calories} unit="kcal" color={colors.caloriesAccent} textColor={colors.text} />
            <NutrientRow label="Protein" value={macros.proteinG} unit="g" color={colors.proteinAccent} textColor={colors.text} />
            <NutrientRow label="Carbs" value={macros.carbsG} unit="g" color={colors.carbsAccent} textColor={colors.text} />
            <NutrientRow label="Fat" value={macros.fatG} unit="g" color={colors.fatAccent} textColor={colors.text} />

            {extendedNutrition && (
              <View style={styles.extendedSection}>
                {extendedNutrition.map((n) => (
                  <NutrientRow
                    key={n.label}
                    label={n.label}
                    value={n.value!}
                    unit={n.unit}
                    color={colors.textSecondary}
                    textColor={colors.text}
                    compact
                  />
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.quantitySection}>
          <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
            Quantity
          </ThemedText>
          <TextInput
            style={[
              styles.quantityInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="1"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.unitPills}
            style={styles.unitScroll}
          >
            {UNITS.map((u) => (
              <Pressable
                key={u}
                style={[
                  styles.unitPill,
                  {
                    backgroundColor: unit === u ? colors.tint : colors.surfaceSecondary,
                    borderColor: unit === u ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => setUnit(u)}
              >
                <ThemedText
                  style={[
                    Typography.subhead,
                    { color: unit === u ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {u}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
              isSaving && styles.buttonDisabled,
            ]}
            onPress={mode === 'add' ? handleAdd : handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>
                {mode === 'add' ? 'Add' : 'Save'}
              </ThemedText>
            )}
          </Pressable>

          {mode === 'edit' && (
            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                { borderColor: colors.destructive, opacity: pressed ? 0.8 : 1 },
                isDeleting && styles.buttonDisabled,
              ]}
              onPress={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator color={colors.destructive} size="small" />
              ) : (
                <ThemedText style={[styles.deleteButtonText, { color: colors.destructive }]}>
                  Delete
                </ThemedText>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function NutrientRow({
  label,
  value,
  unit,
  color,
  textColor,
  compact,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  textColor: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.nutrientRow, compact && styles.nutrientRowCompact]}>
      <View style={styles.nutrientLeft}>
        <View style={[styles.nutrientDot, { backgroundColor: color }]} />
        <ThemedText style={[compact ? Typography.subhead : Typography.body, { color: textColor }]}>
          {label}
        </ThemedText>
      </View>
      <ThemedText style={[compact ? Typography.subhead : Typography.headline, { color: textColor }]}>
        {Math.round(value * 10) / 10}{unit}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
  },
  sheetScrollContent: {
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  foodHeader: {
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  nutritionCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xxl,
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  nutrientRowCompact: {
    paddingVertical: Spacing.xs,
  },
  nutrientLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nutrientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  extendedSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  quantitySection: {
    marginBottom: Spacing.xxl,
  },
  quantityInput: {
    ...Typography.title2,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  unitScroll: {
    marginHorizontal: -Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  unitPills: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  unitPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  actions: {
    gap: Spacing.md,
  },
  primaryButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  deleteButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
  },
  deleteButtonText: {
    ...Typography.headline,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
