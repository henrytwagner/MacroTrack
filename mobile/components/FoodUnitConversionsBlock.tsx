import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  Pressable,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SERVING_UNITS } from '@/constants/units';
import type { FoodUnitConversion } from '@shared/types';
import * as api from '@/services/api';

export type PendingConversion = { unitName: string; quantityInBaseServings: number };

export type FoodUnitConversionsBlockSavedProps = {
  mode: 'saved';
  customFoodId?: string;
  usdaFdcId?: number;
  servingSize: number;
  servingUnit: string;
  selectedUnit: string;
  onSelectUnit: (u: string) => void;
  onConversionsChange?: (list: FoodUnitConversion[]) => void;
};

export type FoodUnitConversionsBlockDraftProps = {
  mode: 'draft';
  servingSize: string;
  servingUnit: string;
  pendingConversions: PendingConversion[];
  onPendingConversionsChange: (next: PendingConversion[]) => void;
  selectedUnit: string;
  onSelectUnit: (u: string) => void;
};

export type FoodUnitConversionsBlockProps =
  | FoodUnitConversionsBlockSavedProps
  | FoodUnitConversionsBlockDraftProps;

export default function FoodUnitConversionsBlock(props: FoodUnitConversionsBlockProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const isSaved = props.mode === 'saved';
  const servingUnit = props.servingUnit;
  const servingSizeNum = isSaved ? props.servingSize : Number(props.servingSize) || 1;

  const [unitConfigs, setUnitConfigs] = useState<FoodUnitConversion[]>([]);
  const [pendingFromUnit, setPendingFromUnit] = useState<string | null>(null);
  const [pendingToUnit, setPendingToUnit] = useState<string | null>(null);
  const [pendingFromQuantity, setPendingFromQuantity] = useState('');
  const [pendingToQuantity, setPendingToQuantity] = useState('');
  const [isSavingUnit, setIsSavingUnit] = useState(false);
  const [unitPickerTarget, setUnitPickerTarget] = useState<'from' | 'to' | null>(null);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);

  const savedConversions = isSaved ? unitConfigs : [];
  const pendingConversions = isSaved ? [] : props.pendingConversions;
  const allConversionUnits = [...savedConversions.map((c) => c.unitName), ...pendingConversions.map((p) => p.unitName)];

  const activeUnitNames = new Set<string>([servingUnit, ...allConversionUnits]);
  /** "Servings" is implicit (1 serving = 1 base amount); don't offer it as a conversion to add or display. */
  const fromOptions = [servingUnit, ...allConversionUnits].filter((u, i, a) => a.indexOf(u) === i);

  const unitTiles = [servingUnit, ...allConversionUnits].filter((u, i, a) => a.indexOf(u) === i);

  // Saved mode: fetch conversions when food id changes.
  const savedCustomFoodId = isSaved ? (props as FoodUnitConversionsBlockSavedProps).customFoodId : undefined;
  const savedUsdaFdcId = isSaved ? (props as FoodUnitConversionsBlockSavedProps).usdaFdcId : undefined;

  useEffect(() => {
    if (!isSaved || (!savedCustomFoodId && savedUsdaFdcId == null)) {
      setUnitConfigs([]);
      return;
    }
    let cancelled = false;
    const onChange = (props as FoodUnitConversionsBlockSavedProps).onConversionsChange;
    (async () => {
      try {
        const list = savedCustomFoodId
          ? await api.getFoodUnitConversionsForCustomFood(savedCustomFoodId)
          : await api.getFoodUnitConversionsForUsdaFood(savedUsdaFdcId!);
        if (!cancelled) {
          setUnitConfigs(list);
          onChange?.(list);
        }
      } catch {
        if (!cancelled) setUnitConfigs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSaved, savedCustomFoodId, savedUsdaFdcId]);

  const fromQtyToBaseServings = useCallback(
    (unitName: string, qty: number): number => {
      if (unitName === servingUnit) {
        return qty / (servingSizeNum || 1);
      }
      if (unitName === 'servings') {
        return qty; // 1 serving = 1 base serving
      }
      const saved = savedConversions.find((c) => c.unitName === unitName);
      if (saved) return qty * saved.quantityInBaseServings;
      const pending = pendingConversions.find((p) => p.unitName === unitName);
      if (pending) return qty * pending.quantityInBaseServings;
      return qty;
    },
    [servingUnit, servingSizeNum, savedConversions, pendingConversions],
  );

  const handlePressAddUnit = () => {
    setShowAddUnitModal(true);
    setPendingFromUnit(servingUnit);
    setPendingToUnit(null);
    setPendingFromQuantity(isSaved ? String(props.servingSize) : props.servingSize || '1');
    setPendingToQuantity('');
  };

  const closeModal = () => {
    setUnitPickerTarget(null);
    setShowAddUnitModal(false);
    setPendingFromUnit(null);
    setPendingToUnit(null);
    setPendingFromQuantity('');
    setPendingToQuantity('');
  };

  const handleSaveUnitConversion = async () => {
    if (!pendingFromUnit || !pendingToUnit) return;
    const fromQty = Number(pendingFromQuantity);
    const toQty = Number(pendingToQuantity);
    if (!Number.isFinite(fromQty) || fromQty <= 0) return;
    if (!Number.isFinite(toQty) || toQty <= 0) return;

    const fromInBaseServings = fromQtyToBaseServings(pendingFromUnit, fromQty);
    const quantityInBaseServings = fromInBaseServings / toQty;

    if (props.mode === 'draft') {
      props.onPendingConversionsChange([
        ...props.pendingConversions.filter((p) => p.unitName !== pendingToUnit),
        { unitName: pendingToUnit, quantityInBaseServings },
      ]);
      closeModal();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    const { customFoodId, usdaFdcId } = props;
    if (!customFoodId && !usdaFdcId) return;

    setIsSavingUnit(true);
    try {
      const created = await api.createFoodUnitConversion({
        unitName: pendingToUnit,
        quantityInBaseServings,
        ...(customFoodId ? { customFoodId } : { usdaFdcId: usdaFdcId! }),
      });
      const next = unitConfigs.filter((c) => c.unitName !== created.unitName).concat(created);
      setUnitConfigs(next);
      props.onConversionsChange?.(next);
      closeModal();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not save unit. Please try again.';
      Alert.alert('Could not save unit', message);
    } finally {
      setIsSavingUnit(false);
    }
  };

  const handlePressUnit = (u: string) => {
    props.onSelectUnit(u);
  };

  return (
    <>
      <View style={styles.unitPillsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.unitPills}
        >
          {unitTiles.map((u) => {
            const isSelected = props.selectedUnit === u;
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
                onPress={() => handlePressUnit(u)}
              >
                <ThemedText
                  style={[Typography.subhead, { color: isSelected ? '#FFFFFF' : colors.text }]}
                >
                  {u}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.unitPill, { backgroundColor: 'transparent', borderColor: colors.borderLight }]}
            onPress={handlePressAddUnit}
          >
            <ThemedText style={[Typography.subhead, { color: colors.textTertiary }]}>+</ThemedText>
          </Pressable>
        </ScrollView>
      </View>

      <Modal
        visible={!!pendingToUnit || showAddUnitModal}
        transparent
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={closeModal}
      >
        <View style={styles.unitModalBackdrop} pointerEvents="box-none">
          {unitPickerTarget !== null && (
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setUnitPickerTarget(null)} />
          )}
          <View
            pointerEvents="box-none"
            style={[
              styles.unitModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
              unitPickerTarget !== null && styles.unitModalCardPicker,
            ]}
          >
            {unitPickerTarget === null ? (
              <View style={styles.unitModalForm}>
                <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.sm }]}>
                  Add unit
                </ThemedText>
                <View style={styles.unitModalStack}>
                  <View style={styles.unitModalInputRow}>
                    <TextInput
                      style={[
                        styles.unitModalQtyInput,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceSecondary,
                        },
                      ]}
                      value={pendingFromQuantity}
                      onChangeText={setPendingFromQuantity}
                      keyboardType="numeric"
                      placeholder="Qty"
                      placeholderTextColor={colors.textTertiary}
                    />
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[
                        styles.unitDropdown,
                        { borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
                      ]}
                      onPress={() => setUnitPickerTarget('from')}
                    >
                      <ThemedText style={[Typography.body, { color: colors.text }]} numberOfLines={1}>
                        {pendingFromUnit || 'Unit'}
                      </ThemedText>
                      <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
                        ▼
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.unitModalInputRow}>
                    <TextInput
                      style={[
                        styles.unitModalQtyInput,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceSecondary,
                        },
                      ]}
                      value={pendingToQuantity}
                      onChangeText={setPendingToQuantity}
                      keyboardType="numeric"
                      placeholder="Qty"
                      placeholderTextColor={colors.textTertiary}
                    />
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={[
                        styles.unitDropdown,
                        { borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
                      ]}
                      onPress={() => setUnitPickerTarget('to')}
                    >
                      <ThemedText style={[Typography.body, { color: colors.text }]} numberOfLines={1}>
                        {pendingToUnit || 'Unit'}
                      </ThemedText>
                      <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
                        ▼
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
                {pendingFromUnit && pendingToUnit && (pendingFromQuantity || pendingToQuantity) && (
                  <ThemedText
                    style={[Typography.footnote, { color: colors.textSecondary, marginTop: Spacing.xs }]}
                  >
                    {pendingFromQuantity || '?'} {pendingFromUnit} = {pendingToQuantity || '?'}{' '}
                    {pendingToUnit}
                  </ThemedText>
                )}
                <View style={styles.unitModalActions}>
                  <Pressable
                    style={({ pressed }) => [styles.unitModalSecondaryButton, { opacity: pressed ? 0.8 : 1 }]}
                    onPress={closeModal}
                    disabled={isSavingUnit}
                  >
                    <ThemedText style={[Typography.body, { color: colors.text }]}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.unitModalPrimaryButton,
                      { backgroundColor: colors.tint, opacity: pressed || isSavingUnit ? 0.8 : 1 },
                    ]}
                    onPress={handleSaveUnitConversion}
                    disabled={isSavingUnit}
                  >
                    {isSavingUnit ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <ThemedText style={[Typography.body, { color: '#FFFFFF' }]}>Save</ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.unitModalPicker}>
                <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.sm }]}>
                  {unitPickerTarget === 'from' ? 'From unit' : 'To unit'}
                </ThemedText>
                <ScrollView
                  style={styles.unitPickerListInline}
                  contentContainerStyle={styles.unitPickerListContent}
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator
                >
                  {unitPickerTarget === 'from' &&
                    fromOptions.map((u) => (
                      <TouchableOpacity
                        key={u}
                        activeOpacity={0.7}
                        style={[styles.unitPickerItem, { borderBottomColor: colors.borderLight }]}
                        onPress={() => {
                          setPendingFromUnit(u);
                          setUnitPickerTarget(null);
                        }}
                      >
                        <ThemedText style={[Typography.body, { color: colors.text }]}>{u}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  {unitPickerTarget === 'to' &&
                    SERVING_UNITS.filter(
                      (u) => u !== 'servings' && !activeUnitNames.has(u) && u !== pendingFromUnit,
                    ).map((u) => (
                      <TouchableOpacity
                        key={u}
                        activeOpacity={0.7}
                        style={[styles.unitPickerItem, { borderBottomColor: colors.borderLight }]}
                        onPress={() => {
                          setPendingToUnit(u);
                          setUnitPickerTarget(null);
                        }}
                      >
                        <ThemedText style={[Typography.body, { color: colors.text }]}>{u}</ThemedText>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  unitPillsWrap: {
    minHeight: 44,
  },
  unitPills: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
  },
  unitPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  unitModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  unitModalCard: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
  },
  unitModalCardPicker: {
    minHeight: 260,
  },
  unitModalForm: {
    width: '100%',
  },
  unitModalPicker: {
    width: '100%',
    minHeight: 220,
  },
  unitModalStack: {
    gap: Spacing.sm,
  },
  unitModalInputRow: {
    flexDirection: 'row',
    height: 44,
    gap: Spacing.sm,
  },
  unitModalQtyInput: {
    width: 56,
    height: 44,
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 0,
    textAlign: 'center',
  },
  unitDropdown: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 0,
  },
  unitPickerListInline: {
    maxHeight: 220,
    borderRadius: BorderRadius.sm,
  },
  unitPickerListContent: {
    paddingBottom: Spacing.md,
  },
  unitPickerItem: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unitModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  unitModalSecondaryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  unitModalPrimaryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
});
