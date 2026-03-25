import React, { useMemo, useState, useEffect } from 'react';
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
  CommunityFood,
  FoodEntry,
  MealLabel,
  FoodUnitConversion,
  UpdateFoodEntryRequest,
} from '@shared/types';
import * as api from '@/services/api';
import { BarcodeCameraScreen } from '@/features/barcode/BarcodeCameraScreen';

type DetailFoodType = USDASearchResult | CustomFood | CommunityFood;
import { scaleFactorForQuantity } from '@/utils/servingScale';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useGoalStore } from '@/stores/goalStore';
import { useDateStore } from '@/stores/dateStore';
import MacroRingProgress from '@/components/MacroRingProgress';
import MacroSummaryBlock from '@/components/MacroSummaryBlock';

type FoodDetailMode = 'add' | 'edit';

interface FoodDetailSheetProps {
  food: DetailFoodType | null;
  mode: FoodDetailMode;
  existingEntry?: FoodEntry;
  selectedDate?: string;
  onDismiss: () => void;
  /** Called after add or edit. For add, the newly created entry is passed so the parent can show "Added" snackbar and update store without refetching. */
  onSaved?: (entry?: FoodEntry) => void;
  onDeleted?: () => void;
  /** Called after forking a community food into a private CustomFood copy. */
  onFork?: (newCustomFood: CustomFood) => void;
  /** When true, render as a full-screen page (no Modal). Use for edit flow so the list is not shown. */
  asFullScreen?: boolean;
  /** When viewing a custom (personal) food: open CreateFoodSheet to edit it. */
  onEditCustomFood?: (food: CustomFood) => void;
  /** When viewing a custom food: open publish flow to share as community food. */
  onPublishCustomFood?: (food: CustomFood) => void;
  /** When viewing a custom food: after deleting it from My Foods, called so parent can refresh lists. */
  onDeleteCustomFood?: (food: CustomFood) => void;
}

function isCustomFood(food: DetailFoodType): food is CustomFood {
  return 'servingSize' in food && 'servingUnit' in food && !('defaultServingSize' in food);
}

function isCommunityFood(food: DetailFoodType): food is CommunityFood {
  return 'defaultServingSize' in food && 'trustScore' in food;
}

/** Provisional label — server recategorizes after save. */
function getMealLabel(): MealLabel {
  return 'snack';
}

function BarcodeEditPanel({
  food,
  onClose,
  onSaved,
  colors,
}: {
  food: CustomFood;
  onClose: () => void;
  onSaved: (barcode: string | undefined) => void;
  colors: (typeof Colors)['light'];
}) {
  const [gtin, setGtin] = useState(food.barcode ?? '');
  const [showCamera, setShowCamera] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (showCamera) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <BarcodeCameraScreen
          defaultFacing="back"
          onScan={(result) => {
            setGtin(result.gtin);
            setShowCamera(false);
          }}
          onCancel={() => setShowCamera(false)}
        />
      </View>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const trimmed = gtin.trim();
      await api.updateCustomFood(food.id, { barcode: trimmed || '' });
      onSaved(trimmed || undefined);
    } catch {
      Alert.alert('Error', 'Could not save barcode.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, barcodeEditStyles.backdrop, { backgroundColor: colors.overlay }]}
      onPress={onClose}
    >
      <Pressable style={[barcodeEditStyles.panel, { backgroundColor: colors.surface }]} onPress={() => {}}>
        <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.sm }]}>
          Barcode
        </ThemedText>
        {food.barcode ? (
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
            Current: {food.barcode}
          </ThemedText>
        ) : null}
        <View style={barcodeEditStyles.inputRow}>
          <TextInput
            style={[barcodeEditStyles.gtinInput, { color: colors.text, borderColor: colors.border }]}
            value={gtin}
            onChangeText={setGtin}
            placeholder="Enter GTIN"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
          />
          <Pressable
            style={[barcodeEditStyles.scanIconBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => setShowCamera(true)}
          >
            <Ionicons name="barcode-outline" size={22} color={colors.tint} />
          </Pressable>
        </View>
        <View style={barcodeEditStyles.panelActions}>
          <Pressable
            style={[barcodeEditStyles.panelBtn, { borderColor: colors.border, borderWidth: 1 }]}
            onPress={onClose}
          >
            <ThemedText style={[Typography.body, { color: colors.text }]}>Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[barcodeEditStyles.panelBtn, { backgroundColor: colors.tint }]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={[Typography.body, { color: '#fff', fontWeight: '600' }]}>Save</ThemedText>
            )}
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
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
  onFork,
  asFullScreen = false,
  onEditCustomFood,
  onPublishCustomFood,
  onDeleteCustomFood,
}: FoodDetailSheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<string>('servings');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unitConfigs, setUnitConfigs] = useState<FoodUnitConversion[]>([]);
  const [dayImpactExpanded, setDayImpactExpanded] = useState(false);
  const [communityMenuVisible, setCommunityMenuVisible] = useState(false);
  const [customMenuVisible, setCustomMenuVisible] = useState(false);
  const [suppressUsdaWarning, setSuppressUsdaWarning] = useState<boolean | null>(null); // null = not yet fetched
  const [usdaWarningVisible, setUsdaWarningVisible] = useState(false);
  const [dontWarnAgain, setDontWarnAgain] = useState(false);
  const [barcodeOverlay, setBarcodeOverlay] = useState<React.ReactNode>(null);
  const [localBarcode, setLocalBarcode] = useState<string | undefined>(
    food && isCustomFood(food) ? food.barcode : undefined,
  );

  const { totals } = useDailyLogStore();
  const { goalsByDate } = useGoalStore();
  const { selectedDate: storeSelectedDate } = useDateStore();

  useEffect(() => {
    if (existingEntry) {
      setQuantity(String(existingEntry.quantity));
      setUnit(existingEntry.unit);
    } else if (food && isCommunityFood(food)) {
      setQuantity(String(food.defaultServingSize));
      setUnit(food.defaultServingUnit);
    } else if (food && isCustomFood(food)) {
      setQuantity(String(food.servingSize));
      setUnit(food.servingUnit);
    } else if (food) {
      setQuantity(food.servingSize ? String(food.servingSize) : '100');
      setUnit(food.servingSizeUnit || 'g');
    }
    setLocalBarcode(food && isCustomFood(food) ? food.barcode : undefined);
  }, [food, existingEntry]);

  useEffect(() => {
    async function loadUnits() {
      if (!food || isCommunityFood(food)) {
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
    if (isCommunityFood(food) || isCustomFood(food)) {
      return { calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG };
    }
    return food.macros;
  }, [food]);

  const baseServingSize = useMemo(() => {
    if (!food) return 1;
    if (isCommunityFood(food)) return food.defaultServingSize || 1;
    if (isCustomFood(food)) return food.servingSize || 1;
    return food.servingSize || 100;
  }, [food]);

  const baseServingUnit = useMemo(() => {
    if (!food) return 'g';
    if (isCommunityFood(food)) return food.defaultServingUnit || 'servings';
    if (isCustomFood(food)) return food.servingUnit || 'servings';
    return food.servingSizeUnit || 'g';
  }, [food]);

  /** Conversion for the currently selected unit, if defined. */
  const conversionForSelectedUnit = useMemo(() => {
    return unitConfigs.find((c) => c.unitName === unit) ?? null;
  }, [unit, unitConfigs]);

  /** Human-readable equivalent of one base serving in the currently selected unit, if applicable. */
  const equivalentServingLabel =
    conversionForSelectedUnit && unit !== baseServingUnit
      ? (() => {
          const qtyInBase = conversionForSelectedUnit.quantityInBaseServings;
          if (!qtyInBase || !Number.isFinite(qtyInBase) || qtyInBase <= 0) return null;
          const amountInSelected = 1 / qtyInBase;
          if (!Number.isFinite(amountInSelected) || amountInSelected <= 0) return null;
          const formatted =
            amountInSelected >= 1
              ? amountInSelected.toFixed(2).replace(/\.00$/, '')
              : amountInSelected.toFixed(2);
          return `${formatted} ${unit}`;
        })()
      : null;

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

  const handleReport = async () => {
    if (!food || !isCommunityFood(food)) return;
    Alert.alert(
      'Report Incorrect Data',
      'Flag this community food as having incorrect nutrition information?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.reportCommunityFood(food.id, 'Incorrect nutrition data');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Reported', 'Thank you for your feedback.');
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ],
    );
  };

  const handleCustomize = () => {
    if (!food || !isCommunityFood(food)) return;
    Alert.alert(
      'Create a personal copy?',
      'Customizing creates a private copy for you only. The community food stays unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create Copy',
          onPress: async () => {
            try {
              const newCustomFood = await api.createCustomFood({
                name: food.name,
                servingSize: food.defaultServingSize,
                servingUnit: food.defaultServingUnit,
                calories: food.calories,
                proteinG: food.proteinG,
                carbsG: food.carbsG,
                fatG: food.fatG,
                sodiumMg: food.sodiumMg,
                cholesterolMg: food.cholesterolMg,
                fiberG: food.fiberG,
                sugarG: food.sugarG,
                saturatedFatG: food.saturatedFatG,
                transFatG: food.transFatG,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onFork?.(newCustomFood);
            } catch (e) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              const message =
                e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not create copy.';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  const doAdd = async () => {
    if (!food || !scaledMacros) return;
    setIsSaving(true);

    const community = isCommunityFood(food);
    const custom = !community && isCustomFood(food);
    const date = selectedDate || new Date().toISOString().split('T')[0];

    const foodName = community
      ? (food.brandName ? `${food.brandName} — ${food.name}` : food.name)
      : custom
        ? (food as CustomFood).name
        : (food as USDASearchResult).description;

    try {
      const created = await api.createEntry({
        date,
        name: foodName,
        calories: scaledMacros.calories,
        proteinG: scaledMacros.proteinG,
        carbsG: scaledMacros.carbsG,
        fatG: scaledMacros.fatG,
        quantity: Number(quantity) || 1,
        unit,
        source: community ? 'COMMUNITY' : custom ? 'CUSTOM' : 'DATABASE',
        mealLabel: getMealLabel(),
        usdaFdcId: community ? undefined : custom ? undefined : (food as USDASearchResult).fdcId,
        customFoodId: custom ? (food as CustomFood).id : undefined,
        communityFoodId: community ? food.id : undefined,
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

  const handleAdd = async () => {
    if (!food || !scaledMacros) return;
    const community = isCommunityFood(food);
    const custom = !community && isCustomFood(food);
    const isUsda = !community && !custom;
    if (isUsda) {
      // Fetch preference lazily on first USDA add attempt
      let suppress = suppressUsdaWarning;
      if (suppress === null) {
        try {
          const prefs = await api.getUserPreferences();
          suppress = prefs.suppressUsdaWarning;
          setSuppressUsdaWarning(suppress);
        } catch {
          suppress = false;
          setSuppressUsdaWarning(false);
        }
      }
      if (!suppress) {
        setDontWarnAgain(false);
        setUsdaWarningVisible(true);
        return;
      }
    }
    doAdd();
  };

  const handleUsdaWarningConfirm = async () => {
    setUsdaWarningVisible(false);
    if (dontWarnAgain) {
      setSuppressUsdaWarning(true);
      api.updateUserPreferences({ suppressUsdaWarning: true }).catch(() => {});
    }
    doAdd();
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

  const displayName = food
    ? isCommunityFood(food)
      ? (food.brandName ? `${food.brandName} — ${food.name}` : food.name)
      : isCustomFood(food)
        ? food.name
        : food.description
    : '';
  const sourceLabel = food
    ? isCommunityFood(food)
      ? `Community · Used ${food.usesCount} times`
      : isCustomFood(food)
        ? 'Custom Food'
        : 'USDA Database'
    : '';
  const baseServingLabel = food
    ? isCommunityFood(food)
      ? `${food.defaultServingSize} ${food.defaultServingUnit}`
      : isCustomFood(food)
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
      {/* USDA warning overlay — rendered inside the sheet so it always appears on top */}
      {barcodeOverlay}
      {usdaWarningVisible && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.warningOverlay, { backgroundColor: colors.overlay, zIndex: 100 }]}
          onPress={() => setUsdaWarningVisible(false)}
        >
          <Pressable style={[styles.warningModal, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <Ionicons name="warning-outline" size={32} color={colors.warning} style={{ alignSelf: 'center', marginBottom: Spacing.sm }} />
            <ThemedText style={[Typography.headline, { color: colors.text, textAlign: 'center', marginBottom: Spacing.sm }]}>
              USDA Data Quality Notice
            </ThemedText>
            <ThemedText style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg }]}>
              USDA database entries can have inconsistent serving sizes and nutrient values. Community and custom foods are generally more reliable.
            </ThemedText>
            <Pressable style={styles.warningCheckRow} onPress={() => setDontWarnAgain((v) => !v)}>
              <Ionicons
                name={dontWarnAgain ? 'checkbox' : 'square-outline'}
                size={20}
                color={dontWarnAgain ? colors.tint : colors.textSecondary}
              />
              <ThemedText style={[Typography.subhead, { color: colors.textSecondary, marginLeft: Spacing.sm }]}>
                Don&apos;t warn again
              </ThemedText>
            </Pressable>
            <View style={styles.warningActions}>
              <Pressable
                style={[styles.warningButton, { borderColor: colors.border }]}
                onPress={() => setUsdaWarningVisible(false)}
              >
                <ThemedText style={[Typography.subhead, { color: colors.text }]}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.warningButton, { backgroundColor: colors.tint }]}
                onPress={handleUsdaWarningConfirm}
              >
                <ThemedText style={[Typography.subhead, { color: '#FFFFFF' }]}>Add Food</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}
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
        {food && (isCommunityFood(food) || isCustomFood(food)) ? (
          <Pressable
            onPress={() => {
              if (isCommunityFood(food)) setCommunityMenuVisible(true);
              else setCustomMenuVisible(true);
            }}
            hitSlop={12}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            accessibilityLabel={isCommunityFood(food) ? 'Community food options' : 'Personal food options'}
          >
            <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={{ width: asFullScreen ? 28 : 50 }} />
        )}
      </View>

      {food && isCommunityFood(food) && (
        <Modal
          visible={communityMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCommunityMenuVisible(false)}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCommunityMenuVisible(false)}
          >
            <View style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} />
          </Pressable>
          <View style={[styles.menuAnchor, { paddingTop: 56 + Spacing.md }]}>
            <View style={[styles.communityMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {onFork && (
                <Pressable
                  style={({ pressed }) => [
                    styles.menuItem,
                    { borderBottomColor: colors.border },
                    pressed && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => {
                    setCommunityMenuVisible(false);
                    handleCustomize();
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.tint} style={{ marginRight: Spacing.sm }} />
                  <ThemedText style={[Typography.body, { color: colors.text }]}>Customize</ThemedText>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.menuItem,
                  styles.menuItemLast,
                  pressed && { backgroundColor: colors.surfaceSecondary },
                ]}
                onPress={() => {
                  setCommunityMenuVisible(false);
                  handleReport();
                }}
              >
                <Ionicons name="flag-outline" size={20} color={colors.destructive} style={{ marginRight: Spacing.sm }} />
                <ThemedText style={[Typography.body, { color: colors.destructive }]}>Report</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {food && isCustomFood(food) && (
        <Modal
          visible={customMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCustomMenuVisible(false)}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCustomMenuVisible(false)}
          >
            <View style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} />
          </Pressable>
          <View style={[styles.menuAnchor, { paddingTop: 56 + Spacing.md }]}>
            <View style={[styles.communityMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {onEditCustomFood && (
                <Pressable
                  style={({ pressed }) => [
                    styles.menuItem,
                    { borderBottomColor: colors.border },
                    pressed && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => {
                    setCustomMenuVisible(false);
                    onEditCustomFood(food);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.tint} style={{ marginRight: Spacing.sm }} />
                  <ThemedText style={[Typography.body, { color: colors.text }]}>Edit</ThemedText>
                </Pressable>
              )}
              {onPublishCustomFood && (
                <Pressable
                  style={({ pressed }) => [
                    styles.menuItem,
                    (onEditCustomFood || onDeleteCustomFood) && { borderBottomColor: colors.border },
                    pressed && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => {
                    setCustomMenuVisible(false);
                    onPublishCustomFood(food);
                  }}
                >
                  <Ionicons name="share-outline" size={20} color={colors.tint} style={{ marginRight: Spacing.sm }} />
                  <ThemedText style={[Typography.body, { color: colors.text }]}>Publish</ThemedText>
                </Pressable>
              )}
              {onDeleteCustomFood && (
                <Pressable
                  style={({ pressed }) => [
                    styles.menuItem,
                    styles.menuItemLast,
                    pressed && { backgroundColor: colors.surfaceSecondary },
                  ]}
                  onPress={() => {
                    setCustomMenuVisible(false);
                    Alert.alert(
                      'Delete food',
                      'This removes it from your My Foods library. Logged entries are not removed.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await api.deleteCustomFood(food.id);
                              onDismiss();
                              onDeleteCustomFood(food);
                            } catch {
                              // leave sheet open on error
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} style={{ marginRight: Spacing.sm }} />
                  <ThemedText style={[Typography.body, { color: colors.destructive }]}>Delete</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </Modal>
      )}

        <ScrollView
          style={styles.sheetContent}
          contentContainerStyle={styles.sheetScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.foodHeader}>
            <View style={styles.foodHeaderNameRow}>
              <ThemedText style={[Typography.title2, { color: colors.text, flex: 1 }]}>
                {displayName}
              </ThemedText>
              {food && isCustomFood(food) && (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setBarcodeOverlay(
                      <BarcodeEditPanel
                        food={{ ...food, barcode: localBarcode }}
                        onClose={() => setBarcodeOverlay(null)}
                        onSaved={(barcode) => {
                          setLocalBarcode(barcode);
                          setBarcodeOverlay(null);
                        }}
                        colors={colors}
                      />,
                    );
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginLeft: Spacing.sm }]}
                >
                  <Ionicons
                    name={localBarcode ? 'barcode' : 'barcode-outline'}
                    size={22}
                    color={localBarcode ? colors.tint : colors.textSecondary}
                  />
                </Pressable>
              )}
            </View>
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
              {sourceLabel}
            </ThemedText>
          </View>

          {scaledMacros && (
            <View style={[styles.infoCard, { backgroundColor: colors.surfaceSecondary }]}>
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
              <View style={[styles.infoCardSeparator, { backgroundColor: colors.border }]} />
              <MacroSummaryBlock
                calories={scaledMacros.calories}
                proteinG={scaledMacros.proteinG}
                carbsG={scaledMacros.carbsG}
                fatG={scaledMacros.fatG}
                colors={colors}
                backgroundColor={colors.surface}
              />
            </View>
          )}

          <View style={styles.quantitySection}>
            <View style={[styles.quantityCard, { backgroundColor: colors.surfaceSecondary }]}>
              {food && (
                <>
                  <View style={styles.quantityCardRow}>
                    <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
                      Serving size
                    </ThemedText>
                    <ThemedText style={[Typography.subhead, { color: colors.text, fontWeight: '500', textAlign: 'right', flex: 1 }]}>
                      {equivalentServingLabel ? `${baseServingLabel} (≈ ${equivalentServingLabel})` : baseServingLabel}
                    </ThemedText>
                  </View>
                  <View style={[styles.quantityCardDivider, { backgroundColor: colors.borderLight }]} />
                </>
              )}
              <View style={styles.quantityCardRow}>
                <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>Amount</ThemedText>
                <TextInput
                  style={[styles.quantityInputInline, { color: colors.text }]}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="done"
                  textAlign="right"
                />
              </View>
              <View style={[styles.quantityCardDivider, { backgroundColor: colors.borderLight }]} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.unitPillsInCard}
              >
                {unitTiles.map((u) => {
                  const isSelected = unit === u;
                  return (
                    <Pressable
                      key={u}
                      style={[
                        styles.unitPill,
                        {
                          backgroundColor: isSelected ? colors.tint : colors.surface,
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
                  { opacity: pressed ? 0.7 : 1 },
                  isDeleting && styles.buttonDisabled,
                ]}
                onPress={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color={colors.destructive} size="small" />
                ) : (
                  <ThemedText style={[styles.deleteButtonText, { color: colors.destructive }]}>
                    Delete Entry
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
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  foodHeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  infoCardSeparator: {
    height: StyleSheet.hairlineWidth,
  },
  quantitySection: {
    marginBottom: Spacing.xxl,
  },
  quantityCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  quantityCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  quantityCardDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
  quantityInputInline: {
    ...Typography.body,
    fontWeight: '600' as const,
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
  },
  unitPillsInCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  quickChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  unitPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  actions: {
    gap: Spacing.sm,
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
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    ...Typography.subhead,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  dayImpactUnderTitle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
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
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuAnchor: {
    position: 'absolute',
    top: 0,
    right: Spacing.xl,
    left: Spacing.xl,
    alignItems: 'flex-end',
  },
  communityMenu: {
    minWidth: 180,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  warningOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningModal: {
    width: 320,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  warningCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  warningActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  warningButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
});

const barcodeEditStyles = StyleSheet.create({
  backdrop: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  panel: {
    width: 320,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  gtinInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
  },
  scanIconBtn: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  panelActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  panelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
});
