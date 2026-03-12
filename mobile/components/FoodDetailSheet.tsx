import { useMemo, useState, useEffect } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type {
  USDASearchResult,
  CustomFood,
  FoodEntry,
  MealLabel,
  FoodUnitConversion,
  UpdateFoodEntryRequest,
} from '@shared/types';
import * as api from '@/services/api';
import { scaleFactorForQuantity } from '@/utils/servingScale';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useGoalStore } from '@/stores/goalStore';
import { useDateStore } from '@/stores/dateStore';
import MacroRingProgress from '@/components/MacroRingProgress';
import MacroSummaryBlock from '@/components/MacroSummaryBlock';

type FoodDetailMode = 'add' | 'edit';

interface FoodDetailSheetProps {
  food: USDASearchResult | CustomFood | null;
  mode: FoodDetailMode;
  existingEntry?: FoodEntry;
  selectedDate?: string;
  onDismiss: () => void;
  /** Called after add or edit. For add, the newly created entry is passed so the parent can show "Added" snackbar and update store without refetching. */
  onSaved?: (entry?: FoodEntry) => void;
  onDeleted?: () => void;
  /** When true, render as a full-screen page (no Modal). Use for edit flow so the list is not shown. */
  asFullScreen?: boolean;
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

function DayImpactRow({
  label,
  current,
  goal,
  unit,
  colors,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  colors: Record<string, string>;
}) {
  const remaining = goal - current;
  const isOver = remaining < 0;
  const text =
    remaining >= 0
      ? `${Math.round(remaining)}${unit} left`
      : `${Math.round(Math.abs(remaining))}${unit} over`;
  return (
    <View style={styles.dayImpactDetailRow}>
      <ThemedText style={[Typography.caption2, { color: colors.textSecondary }]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption2,
          { color: isOver ? colors.progressOverflow : colors.textSecondary },
          styles.dayImpactDetailValue,
        ]}
      >
        {Math.round(current)} / {goal}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption2,
          { color: isOver ? colors.progressOverflow : colors.textTertiary },
        ]}
      >
        {text}
      </ThemedText>
    </View>
  );
}

export default function FoodDetailSheet({
  food,
  mode,
  existingEntry,
  selectedDate,
  onDismiss,
  onSaved,
  onDeleted,
  asFullScreen = false,
}: FoodDetailSheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<string>('servings');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unitConfigs, setUnitConfigs] = useState<FoodUnitConversion[]>([]);
  const [dayImpactExpanded, setDayImpactExpanded] = useState(false);

  const { totals } = useDailyLogStore();
  const { goalsByDate } = useGoalStore();
  const { selectedDate: storeSelectedDate } = useDateStore();

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

  useEffect(() => {
    async function loadUnits() {
      if (!food) {
        setUnitConfigs([]);
        return;
      }
      try {
        if (isCustomFood(food)) {
          const configs = await api.getFoodUnitConversionsForCustomFood(food.id);
          setUnitConfigs(configs);
        } else {
          const configs = await api.getFoodUnitConversionsForUsdaFood(food.fdcId);
          setUnitConfigs(configs);
        }
      } catch {
        setUnitConfigs([]);
      }
    }
    loadUnits();
  }, [food]);

  const baseMacros = useMemo(() => {
    if (!food) return null;
    return isCustomFood(food)
      ? { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }
      : food.macros;
  }, [food]);

  const baseServingSize = useMemo(() => {
    if (!food) return 1;
    if (isCustomFood(food)) return food.servingSize || 1;
    return food.servingSize || 100;
  }, [food]);

  const baseServingUnit = useMemo(() => {
    if (!food) return 'g';
    if (isCustomFood(food)) return food.servingUnit || 'servings';
    return food.servingSizeUnit || 'g';
  }, [food]);

  /** Conversion for the currently selected unit, if defined. */
  const conversionForSelectedUnit = useMemo(() => {
    return unitConfigs.find((c) => c.unitName === unit) ?? null;
  }, [unit, unitConfigs]);

  const scaleFactor = useMemo(
    () =>
      scaleFactorForQuantity(
        Number(quantity) || 0,
        unit,
        { size: baseServingSize, unit: baseServingUnit },
        conversionForSelectedUnit,
      ),
    [quantity, unit, baseServingSize, baseServingUnit, conversionForSelectedUnit],
  );

  const scaledMacros = useMemo(() => {
    if (!baseMacros) return null;
    return {
      calories: Math.round(baseMacros.calories * scaleFactor),
      proteinG: Math.round(baseMacros.proteinG * scaleFactor * 10) / 10,
      carbsG: Math.round(baseMacros.carbsG * scaleFactor * 10) / 10,
      fatG: Math.round(baseMacros.fatG * scaleFactor * 10) / 10,
    };
  }, [baseMacros, scaleFactor]);

  const dayKey = selectedDate ?? storeSelectedDate;
  const goalsForDay = goalsByDate[dayKey] ?? null;

  const projectedTotals = useMemo(() => {
    if (!scaledMacros) return totals;

    if (mode === 'add') {
      return {
        calories: totals.calories + scaledMacros.calories,
        proteinG: totals.proteinG + scaledMacros.proteinG,
        carbsG: totals.carbsG + scaledMacros.carbsG,
        fatG: totals.fatG + scaledMacros.fatG,
      };
    }

    if (mode === 'edit' && existingEntry) {
      return {
        calories:
          totals.calories - existingEntry.calories + scaledMacros.calories,
        proteinG:
          totals.proteinG - existingEntry.proteinG + scaledMacros.proteinG,
        carbsG:
          totals.carbsG - existingEntry.carbsG + scaledMacros.carbsG,
        fatG: totals.fatG - existingEntry.fatG + scaledMacros.fatG,
      };
    }

    return totals;
  }, [totals, scaledMacros, mode, existingEntry]);

  const remainingAfter = useMemo(() => {
    if (!goalsForDay) return null;
    return {
      calories: goalsForDay.calories - projectedTotals.calories,
      proteinG: goalsForDay.proteinG - projectedTotals.proteinG,
      carbsG: goalsForDay.carbsG - projectedTotals.carbsG,
      fatG: goalsForDay.fatG - projectedTotals.fatG,
    };
  }, [goalsForDay, projectedTotals]);

  const handleAdd = async () => {
    if (!food || !scaledMacros) return;
    setIsSaving(true);

    const custom = isCustomFood(food);
    const date = selectedDate || new Date().toISOString().split('T')[0];

    try {
      const created = await api.createEntry({
        date,
        name: custom ? food.name : food.description,
        calories: scaledMacros.calories,
        proteinG: scaledMacros.proteinG,
        carbsG: scaledMacros.carbsG,
        fatG: scaledMacros.fatG,
        quantity: Number(quantity) || 1,
        unit,
        source: custom ? 'CUSTOM' : 'DATABASE',
        mealLabel: getMealLabel(),
        usdaFdcId: custom ? undefined : food.fdcId,
        customFoodId: custom ? food.id : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.(created);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not save. Please try again.';
      Alert.alert('Could not save', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!existingEntry) return;
    setIsSaving(true);
    try {
      const payload: UpdateFoodEntryRequest = {
        quantity: Number(quantity) || 1,
        unit,
      };
      if (scaledMacros) {
        payload.calories = scaledMacros.calories;
        payload.proteinG = scaledMacros.proteinG;
        payload.carbsG = scaledMacros.carbsG;
        payload.fatG = scaledMacros.fatG;
      }
      await api.updateEntry(existingEntry.id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.(); // edit: no entry passed
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not save. Please try again.';
      Alert.alert('Could not save', message);
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
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not delete. Please try again.';
      Alert.alert('Could not delete', message);
    } finally {
      setIsDeleting(false);
    }
  };

  const foodName = food ? (isCustomFood(food) ? food.name : food.description) : '';
  const sourceLabel = food ? (isCustomFood(food) ? 'Custom Food' : 'USDA Database') : '';
  const baseServingLabel = food
    ? isCustomFood(food)
      ? `${food.servingSize} ${food.servingUnit}`
      : `${food.servingSize ?? 100}${food.servingSizeUnit ?? 'g'}`
    : '';

  const unitTiles = useMemo(() => {
    const active = [baseServingUnit, 'servings', ...unitConfigs.map((c) => c.unitName)];
    return [...new Set(active)].filter(Boolean);
  }, [baseServingUnit, unitConfigs]);

  const formContent = (
    <>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={onDismiss} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          {asFullScreen ? (
            <Ionicons name="chevron-back" size={28} color={colors.tint} />
          ) : (
            <ThemedText style={[Typography.body, { color: colors.tint }]}>Cancel</ThemedText>
          )}
        </Pressable>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>
          {mode === 'add' ? 'Add Food' : 'Edit Entry'}
        </ThemedText>
        <View style={{ width: asFullScreen ? 28 : 50 }} />
      </View>

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

          {scaledMacros && (
            <Pressable
              style={({ pressed }) => [
                styles.dayImpactUnderTitle,
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDayImpactExpanded((e) => !e);
              }}
            >
              <MacroRingProgress
                totals={projectedTotals}
                goals={goalsForDay}
                variant="default"
                showCalorieSummary={!dayImpactExpanded}
                tightSpacing
              />
              {dayImpactExpanded && goalsForDay && (
                <View style={[styles.dayImpactDetails, { borderTopColor: colors.border }]}>
                  <DayImpactRow
                    label="Cal"
                    current={projectedTotals.calories}
                    goal={goalsForDay.calories}
                    unit=""
                    colors={colors}
                  />
                  <DayImpactRow
                    label="P"
                    current={projectedTotals.proteinG}
                    goal={goalsForDay.proteinG}
                    unit="g"
                    colors={colors}
                  />
                  <DayImpactRow
                    label="C"
                    current={projectedTotals.carbsG}
                    goal={goalsForDay.carbsG}
                    unit="g"
                    colors={colors}
                  />
                  <DayImpactRow
                    label="F"
                    current={projectedTotals.fatG}
                    goal={goalsForDay.fatG}
                    unit="g"
                    colors={colors}
                  />
                </View>
              )}
            </Pressable>
          )}

          {scaledMacros && (
            <View style={styles.macroBlockWrap}>
              <MacroSummaryBlock
                calories={scaledMacros.calories}
                proteinG={scaledMacros.proteinG}
                carbsG={scaledMacros.carbsG}
                fatG={scaledMacros.fatG}
                colors={colors}
                backgroundColor={colors.surfaceSecondary}
              />
            </View>
          )}

          <View style={styles.quantitySection}>
            {food && (
              <View style={[styles.servingSizeBlock, { backgroundColor: colors.surfaceSecondary }]}>
                <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
                  Serving size
                </ThemedText>
                <ThemedText style={[Typography.body, { color: colors.text, fontWeight: '600' }]}>
                  {baseServingLabel}
                </ThemedText>
              </View>
            )}

            <ThemedText style={[Typography.subhead, { color: colors.text, marginBottom: Spacing.xs }]}>
              Amount
            </ThemedText>
            <TextInput
              style={[
                styles.quantityInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholder=""
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.unitPills}
            >
              {unitTiles.map((u) => {
                const isSelected = unit === u;
                return (
                  <Pressable
                    key={u}
                    style={[
                      styles.unitPill,
                      {
                        backgroundColor: isSelected ? colors.tint : colors.surfaceSecondary,
                        borderColor: isSelected ? colors.tint : colors.border,
                      },
                    ]}
                    onPress={() => setUnit(u)}
                  >
                    <ThemedText
                      style={[Typography.subhead, { color: isSelected ? '#FFFFFF' : colors.text }]}
                    >
                      {u}
                    </ThemedText>
                  </Pressable>
                );
              })}
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
              disabled={isSaving || (mode === 'add' && (Number(quantity) || 0) <= 0)}
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
      </SafeAreaView>
    </>
  );

  if (asFullScreen) return formContent;
  return (
    <Modal
      visible={!!food}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      {formContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetContent: {
    flex: 1,
  },
  sheetScrollContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
  },
  foodHeader: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  macroBlockWrap: {
    marginBottom: Spacing.lg,
  },
  quantitySection: {
    marginBottom: Spacing.xxl,
  },
  servingSizeBlock: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  quickChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  quantityInput: {
    ...Typography.title2,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  unitPills: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
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
  dayImpactUnderTitle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    marginBottom: 0,
  },
  dayImpactDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dayImpactDetailRow: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  dayImpactDetailValue: {
    fontWeight: '600',
  },
});
