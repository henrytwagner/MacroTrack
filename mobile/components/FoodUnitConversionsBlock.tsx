import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import React from 'react';
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  Pressable,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  SERVING_UNITS,
  getMeasurementSystem,
  WEIGHT_RATIOS_G,
  VOLUME_RATIOS_ML,
} from '@/constants/units';
import type { FoodUnitConversion } from '@shared/types';
import * as api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PendingConversion = { unitName: string; quantityInBaseServings: number };

type PanelState =
  | { mode: 'idle' }
  | { mode: 'preview'; unitName: string }
  | { mode: 'picking' }
  | { mode: 'form'; editingUnit: string | null; pickingFrom: boolean };

type ConflictItem = { id?: string; unitName: string; oldQIBS: number; newQIBS: number };

export type FoodUnitConversionsBlockSavedProps = {
  mode: 'saved';
  customFoodId?: string;
  usdaFdcId?: number;
  servingSize: number;
  servingUnit: string;
  noUnitSelection?: boolean;
  selectedUnit?: string;
  onSelectUnit?: (u: string) => void;
  onConversionsChange?: (list: FoodUnitConversion[]) => void;
  onOverlayRender?: (node: React.ReactNode | null) => void;
};

export type FoodUnitConversionsBlockDraftProps = {
  mode: 'draft';
  servingSize: string;
  servingUnit: string;
  pendingConversions: PendingConversion[];
  onPendingConversionsChange: (next: PendingConversion[]) => void;
  noUnitSelection?: boolean;
  selectedUnit?: string;
  onSelectUnit?: (u: string) => void;
  onOverlayRender?: (node: React.ReactNode | null) => void;
};

export type FoodUnitConversionsBlockProps =
  | FoodUnitConversionsBlockSavedProps
  | FoodUnitConversionsBlockDraftProps;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryAutoConvert(
  toUnit: string,
  servingUnit: string,
  servingSizeNum: number,
  existingConversions: { unitName: string; quantityInBaseServings: number }[],
): { fromUnit: string; fromQty: number; toQty: number } | null {
  const toSystem = getMeasurementSystem(toUnit);
  if (toSystem === 'abstract') return null;

  const toRatios = toSystem === 'weight' ? WEIGHT_RATIOS_G : VOLUME_RATIOS_ML;
  const toUnitInStd = toRatios[toUnit];

  const servingSystem = getMeasurementSystem(servingUnit);
  if (servingSystem === toSystem && servingUnit in toRatios) {
    const servingUnitInStd = toRatios[servingUnit];
    const fromQty = servingSizeNum;
    const toQty = (fromQty * servingUnitInStd) / toUnitInStd;
    return { fromUnit: servingUnit, fromQty, toQty };
  }

  // Bridge through an existing conversion in the same system as toUnit
  for (const conv of existingConversions) {
    if (getMeasurementSystem(conv.unitName) !== toSystem) continue;
    if (!(conv.unitName in toRatios)) continue;
    const convUnitInStd = toRatios[conv.unitName];
    const fromQty = toUnitInStd / convUnitInStd;
    const toQty = 1;
    return { fromUnit: conv.unitName, fromQty, toQty };
  }

  return null;
}

function checkConflicts(
  toUnit: string,
  newQIBS: number,
  existingConversions: { id?: string; unitName: string; quantityInBaseServings: number }[],
): ConflictItem[] {
  const toSystem = getMeasurementSystem(toUnit);
  if (toSystem === 'abstract') return [];

  const toRatios = toSystem === 'weight' ? WEIGHT_RATIOS_G : VOLUME_RATIOS_ML;
  if (!(toUnit in toRatios)) return [];
  const toUnitInStd = toRatios[toUnit];

  const conflicts: ConflictItem[] = [];
  for (const conv of existingConversions) {
    if (conv.unitName === toUnit) continue;
    if (getMeasurementSystem(conv.unitName) !== toSystem) continue;
    if (!(conv.unitName in toRatios)) continue;
    const convUnitInStd = toRatios[conv.unitName];
    const expectedQIBS = (newQIBS * convUnitInStd) / toUnitInStd;
    const deviation =
      Math.abs(expectedQIBS - conv.quantityInBaseServings) / (conv.quantityInBaseServings || 1);
    if (deviation > 0.01) {
      conflicts.push({
        id: conv.id,
        unitName: conv.unitName,
        oldQIBS: conv.quantityInBaseServings,
        newQIBS: expectedQIBS,
      });
    }
  }
  return conflicts;
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function FoodUnitConversionsBlock(props: FoodUnitConversionsBlockProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const isSaved = props.mode === 'saved';
  const noUnitSelection = props.noUnitSelection ?? false;
  const onOverlayRender = props.mode === 'saved'
    ? (props as FoodUnitConversionsBlockSavedProps).onOverlayRender
    : (props as FoodUnitConversionsBlockDraftProps).onOverlayRender;
  const servingUnit = props.servingUnit;
  const servingSizeNum = isSaved ? (props as FoodUnitConversionsBlockSavedProps).servingSize : Number(props.servingSize) || 1;

  const [unitConfigs, setUnitConfigs] = useState<FoodUnitConversion[]>([]);
  const [panel, setPanel] = useState<PanelState>({ mode: 'idle' });
  const [formFromUnit, setFormFromUnit] = useState('');
  const [formFromQty, setFormFromQty] = useState('');
  const [formToQty, setFormToQty] = useState('');
  const [isSavingUnit, setIsSavingUnit] = useState(false);
  const [cascadeWarning, setCascadeWarning] = useState<ConflictItem[] | null>(null);

  const savedConversions = useMemo(() => (isSaved ? unitConfigs : []), [isSaved, unitConfigs]);
  // Extract pendingConversions reference before memoization so hooks have stable deps
  const rawPendingConversions = props.mode === 'draft' ? props.pendingConversions : null;
  const draftPendingConversions = useMemo(
    () => rawPendingConversions ?? [],
    [rawPendingConversions],
  );
  const allConversions: { id?: string; unitName: string; quantityInBaseServings: number }[] = useMemo(
    () => [...savedConversions, ...draftPendingConversions],
    [savedConversions, draftPendingConversions],
  );

  // Reset panel when servingUnit changes (would invalidate preview/form context)
  useEffect(() => {
    setPanel({ mode: 'idle' });
    setCascadeWarning(null);
  }, [servingUnit]);

  // Saved mode: fetch conversions when food id changes
  const savedCustomFoodId = isSaved ? (props as FoodUnitConversionsBlockSavedProps).customFoodId : undefined;
  const savedUsdaFdcId = isSaved ? (props as FoodUnitConversionsBlockSavedProps).usdaFdcId : undefined;
  const onConversionsChange = isSaved ? (props as FoodUnitConversionsBlockSavedProps).onConversionsChange : undefined;

  useEffect(() => {
    if (!isSaved || (!savedCustomFoodId && savedUsdaFdcId == null)) {
      setUnitConfigs([]);
      return;
    }
    let cancelled = false;
    const onChange = onConversionsChange;
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
  }, [isSaved, savedCustomFoodId, savedUsdaFdcId, onConversionsChange]);

  const fromQtyToBaseServings = useCallback(
    (unitName: string, qty: number): number => {
      if (unitName === servingUnit) return qty / (servingSizeNum || 1);
      if (unitName === 'servings') return qty;
      const saved = savedConversions.find((c) => c.unitName === unitName);
      if (saved) return qty * saved.quantityInBaseServings;
      const pending = draftPendingConversions.find((p) => p.unitName === unitName);
      if (pending) return qty * pending.quantityInBaseServings;
      return qty;
    },
    [servingUnit, servingSizeNum, savedConversions, draftPendingConversions],
  );

  const computeQIBS = useCallback(
    (fromUnit: string, fromQty: number, toQty: number): number => {
      const fromInBase = fromQtyToBaseServings(fromUnit, fromQty);
      return fromInBase / (toQty || 1);
    },
    [fromQtyToBaseServings],
  );

  // ---------------------------------------------------------------------------
  // Panel helpers
  // ---------------------------------------------------------------------------

  const closePanel = () => {
    setPanel({ mode: 'idle' });
    setCascadeWarning(null);
    setFormFromUnit('');
    setFormFromQty('');
    setFormToQty('');
  };

  const openPickerStep = () => {
    setPanel({ mode: 'picking' });
    setCascadeWarning(null);
  };

  const openAddForm = (pickedUnit: string) => {
    const autoFill = tryAutoConvert(pickedUnit, servingUnit, servingSizeNum, allConversions);
    setFormFromUnit(autoFill?.fromUnit ?? servingUnit);
    setFormFromQty(autoFill ? String(+autoFill.fromQty.toFixed(4)) : '');
    setFormToQty(autoFill ? String(+autoFill.toQty.toFixed(4)) : '');
    setCascadeWarning(null);
    setPanel({ mode: 'form', editingUnit: null, pickingFrom: false } as PanelState);
    _setPendingToUnit(pickedUnit);
  };

  const openEditForm = (unitName: string) => {
    const conv = allConversions.find((c) => c.unitName === unitName);
    if (!conv) return;
    const fromQty = conv.quantityInBaseServings * servingSizeNum;
    setFormFromUnit(servingUnit);
    setFormFromQty(String(+fromQty.toFixed(4)));
    setFormToQty('1');
    setCascadeWarning(null);
    setPanel({ mode: 'form', editingUnit: unitName, pickingFrom: false } as PanelState);
    _setPendingToUnit(unitName);
  };

  // We need to track the toUnit for the form separately from panel state
  const [pendingToUnit, _setPendingToUnit] = useState<string>('');

  const openFromPicker = () => {
    setPanel((prev) => {
      if (prev.mode !== 'form') return prev;
      return { ...prev, pickingFrom: true };
    });
  };

  const selectFromUnit = (unit: string) => {
    setFormFromUnit(unit);
    setCascadeWarning(null);
    setPanel((prev) => {
      if (prev.mode !== 'form') return prev;
      return { ...prev, pickingFrom: false };
    });
  };

  const handlePillPress = (unitName: string) => {
    if (!noUnitSelection) {
      props.onSelectUnit?.(unitName);
      return;
    }
    if (panel.mode === 'preview' && panel.unitName === unitName) {
      closePanel();
    } else {
      setPanel({ mode: 'preview', unitName });
      setCascadeWarning(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Save logic
  // ---------------------------------------------------------------------------

  const handleSave = async (overrideCascade?: ConflictItem[]) => {
    if (!pendingToUnit) return;
    const fromQty = Number(formFromQty);
    const toQty = Number(formToQty);
    if (!Number.isFinite(fromQty) || fromQty <= 0) return;
    if (!Number.isFinite(toQty) || toQty <= 0) return;

    const newQIBS = computeQIBS(formFromUnit, fromQty, toQty);
    if (!Number.isFinite(newQIBS) || newQIBS <= 0) return;

    // Conflict check (only when not already confirmed)
    if (!overrideCascade) {
      const existing = allConversions.filter((c) => c.unitName !== pendingToUnit);
      const conflicts = checkConflicts(pendingToUnit, newQIBS, existing);
      if (conflicts.length > 0) {
        setCascadeWarning(conflicts);
        return;
      }
    }

    const cascadeItems = overrideCascade ?? [];

    if (props.mode === 'draft') {
      const next = [
        ...draftPendingConversions.filter((p) => p.unitName !== pendingToUnit),
        { unitName: pendingToUnit, quantityInBaseServings: newQIBS },
      ].map((p) => {
        const cascade = cascadeItems.find((c) => c.unitName === p.unitName);
        return cascade ? { ...p, quantityInBaseServings: cascade.newQIBS } : p;
      });
      props.onPendingConversionsChange(next);
      closePanel();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    const { customFoodId, usdaFdcId } = props as FoodUnitConversionsBlockSavedProps;
    if (!customFoodId && !usdaFdcId) return;

    setIsSavingUnit(true);
    try {
      const created = await api.createFoodUnitConversion({
        unitName: pendingToUnit,
        quantityInBaseServings: newQIBS,
        measurementSystem: getMeasurementSystem(pendingToUnit),
        ...(customFoodId ? { customFoodId } : { usdaFdcId: usdaFdcId! }),
      });

      let next = unitConfigs.filter((c) => c.unitName !== created.unitName).concat(created);

      if (cascadeItems.length > 0) {
        await api.cascadeUnitConversions({
          updates: cascadeItems
            .filter((ci) => ci.id)
            .map((ci) => ({ id: ci.id!, quantityInBaseServings: ci.newQIBS })),
        });
        next = next.map((c) => {
          const cascade = cascadeItems.find((ci) => ci.unitName === c.unitName);
          return cascade ? { ...c, quantityInBaseServings: cascade.newQIBS } : c;
        });
      }

      setUnitConfigs(next);
      (props as FoodUnitConversionsBlockSavedProps).onConversionsChange?.(next);
      closePanel();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not save unit.';
      Alert.alert('Could not save unit', message);
    } finally {
      setIsSavingUnit(false);
    }
  };

  const handleDelete = async (unitName: string) => {
    const doDelete = async () => {
      if (props.mode === 'draft') {
        props.onPendingConversionsChange(
          draftPendingConversions.filter((p) => p.unitName !== unitName),
        );
        closePanel();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      const conv = unitConfigs.find((c) => c.unitName === unitName);
      if (!conv) return;
      setIsSavingUnit(true);
      try {
        await api.deleteFoodUnitConversion(conv.id);
        const next = unitConfigs.filter((c) => c.unitName !== unitName);
        setUnitConfigs(next);
        (props as FoodUnitConversionsBlockSavedProps).onConversionsChange?.(next);
        closePanel();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const msg =
          e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not delete.';
        Alert.alert('Could not delete', msg);
      } finally {
        setIsSavingUnit(false);
      }
    };

    doDelete();
  };

  // ---------------------------------------------------------------------------
  // Overlay effect (noUnitSelection=true path only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!noUnitSelection) return;
    if (panel.mode === 'idle') {
      onOverlayRender?.(null);
      return;
    }

    const previewConvLocal = panel.mode === 'preview'
      ? allConversions.find((c) => c.unitName === panel.unitName)
      : null;
    const formToUnitLabelLocal = pendingToUnit || '';
    const panelAsForm = panel.mode === 'form' ? (panel as { mode: 'form'; editingUnit: string | null; pickingFrom: boolean }) : null;
    const isEditFormLocal = panelAsForm !== null && panelAsForm.editingUnit !== null;
    const editingUnitLocal = panelAsForm?.editingUnit ?? null;
    const handleCancelLocal = isEditFormLocal && editingUnitLocal
      ? () => setPanel({ mode: 'preview', unitName: editingUnitLocal })
      : closePanel;
    const fromOptionsLocal = [servingUnit, ...allConversions.map((c) => c.unitName)].filter(
      (u, i, a) => a.indexOf(u) === i && u !== pendingToUnit,
    );
    const activeUnitNamesLocal = new Set<string>([servingUnit, ...allConversions.map((c) => c.unitName)]);
    const pickableUnitsLocal = SERVING_UNITS.filter(
      (u) => u !== 'servings' && !activeUnitNamesLocal.has(u),
    );
    const canSaveLocal =
      formFromUnit &&
      formToUnitLabelLocal &&
      Number(formFromQty) > 0 &&
      Number(formToQty) > 0;
    const colorsLocal = Colors[colorScheme ?? 'light'];

    const overlay = (
      <Pressable
        style={styles.overlayBackdrop}
        onPress={panel.mode === 'preview' ? closePanel : undefined}
      >
        <Pressable
          style={[
            styles.floatingCard,
            { backgroundColor: colorsLocal.surface, borderColor: colorsLocal.border },
            panel.mode === 'preview' && styles.floatingCardPreview,
            (panel.mode === 'picking' || panelAsForm?.pickingFrom) && styles.floatingCardPicker,
          ]}
          onPress={() => {/* absorb taps so backdrop dismiss doesn't fire */}}
        >
          {/* ── Preview ── */}
          {panel.mode === 'preview' && previewConvLocal && (
            <View style={styles.previewRow}>
              <ThemedText style={[Typography.body, { color: colorsLocal.text, flex: 1 }]}>
                1 {previewConvLocal.unitName} = {(previewConvLocal.quantityInBaseServings * servingSizeNum).toFixed(2)} {servingUnit}
              </ThemedText>
              <TouchableOpacity
                style={styles.editIconButton}
                onPress={() => openEditForm(previewConvLocal.unitName)}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={20} color={colorsLocal.tint} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 1: Unit picker ── */}
          {panel.mode === 'picking' && (
            <View>
              <View style={styles.panelHeader}>
                <ThemedText style={[Typography.headline, { color: colorsLocal.text }]}>
                  Choose unit
                </ThemedText>
                <TouchableOpacity onPress={closePanel} activeOpacity={0.7}>
                  <ThemedText style={[Typography.body, { color: colorsLocal.textTertiary }]}>✕</ThemedText>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.pickerList}
                contentContainerStyle={styles.pickerListContent}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator
              >
                {pickableUnitsLocal.map((u) => (
                  <TouchableOpacity
                    key={u}
                    activeOpacity={0.7}
                    style={[styles.pickerItem, { borderBottomColor: colorsLocal.borderLight }]}
                    onPress={() => openAddForm(u)}
                  >
                    <ThemedText style={[Typography.body, { color: colorsLocal.text }]}>{u}</ThemedText>
                  </TouchableOpacity>
                ))}
                {pickableUnitsLocal.length === 0 && (
                  <ThemedText style={[Typography.body, { color: colorsLocal.textTertiary }]}>
                    All units already added.
                  </ThemedText>
                )}
              </ScrollView>
            </View>
          )}

          {/* ── Step 2 / Edit form ── */}
          {panel.mode === 'form' && (
            <View>
              <View style={styles.panelHeader}>
                <ThemedText style={[Typography.headline, { color: colorsLocal.text }]}>
                  {isEditFormLocal ? 'Edit unit' : 'Add unit'}
                </ThemedText>
                {isEditFormLocal && editingUnitLocal && (
                  <TouchableOpacity
                    style={styles.editIconButton}
                    onPress={() => handleDelete(editingUnitLocal)}
                    disabled={isSavingUnit}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={20} color={colorsLocal.destructive} />
                  </TouchableOpacity>
                )}
              </View>

              {/* From-unit picker (replaces form fields when active) */}
              {panelAsForm?.pickingFrom ? (
                <View>
                  <ThemedText style={[Typography.subhead, { color: colorsLocal.textSecondary, marginBottom: Spacing.sm }]}>
                    From unit
                  </ThemedText>
                  <ScrollView
                    style={styles.pickerList}
                    contentContainerStyle={styles.pickerListContent}
                    keyboardShouldPersistTaps="always"
                    showsVerticalScrollIndicator
                  >
                    {fromOptionsLocal.map((u) => (
                      <TouchableOpacity
                        key={u}
                        activeOpacity={0.7}
                        style={[styles.pickerItem, { borderBottomColor: colorsLocal.borderLight }]}
                        onPress={() => selectFromUnit(u)}
                      >
                        <ThemedText style={[Typography.body, { color: colorsLocal.text }]}>{u}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <View>
                  {/* Conversion input row */}
                  <View style={styles.conversionRow}>
                    <TextInput
                      style={[
                        styles.qtyInput,
                        { color: colorsLocal.text, borderColor: colorsLocal.border, backgroundColor: colorsLocal.surfaceSecondary },
                      ]}
                      value={formFromQty}
                      onChangeText={(t) => {
                        setFormFromQty(t);
                        setCascadeWarning(null);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="Qty"
                      placeholderTextColor={colorsLocal.textTertiary}
                    />
                    {fromOptionsLocal.length <= 1 ? (
                      <View style={[styles.lockedUnitLabel, { backgroundColor: colorsLocal.surfaceSecondary, borderColor: colorsLocal.border }]}>
                        <ThemedText style={[Typography.body, { color: colorsLocal.textSecondary }]} numberOfLines={1}>
                          {formFromUnit || 'Unit'}
                        </ThemedText>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={[
                          styles.unitDropdown,
                          { borderColor: colorsLocal.border, backgroundColor: colorsLocal.surfaceSecondary },
                        ]}
                        onPress={openFromPicker}
                      >
                        <ThemedText style={[Typography.body, { color: colorsLocal.text }]} numberOfLines={1}>
                          {formFromUnit || 'Unit'}
                        </ThemedText>
                        <ThemedText style={[Typography.caption1, { color: colorsLocal.textTertiary }]}>▼</ThemedText>
                      </TouchableOpacity>
                    )}
                    <ThemedText style={[Typography.body, { color: colorsLocal.textSecondary }]}>=</ThemedText>
                    <TextInput
                      style={[
                        styles.qtyInput,
                        { color: colorsLocal.text, borderColor: colorsLocal.border, backgroundColor: colorsLocal.surfaceSecondary },
                      ]}
                      value={formToQty}
                      onChangeText={(t) => {
                        setFormToQty(t);
                        setCascadeWarning(null);
                      }}
                      keyboardType="decimal-pad"
                      placeholder="Qty"
                      placeholderTextColor={colorsLocal.textTertiary}
                    />
                    <View style={[styles.lockedUnitLabel, { backgroundColor: colorsLocal.surfaceSecondary, borderColor: colorsLocal.border }]}>
                      <ThemedText style={[Typography.body, { color: colorsLocal.textSecondary }]} numberOfLines={1}>
                        {formToUnitLabelLocal}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Cascade warning */}
                  {cascadeWarning && cascadeWarning.length > 0 && (
                    <View style={[styles.cascadeBox, { backgroundColor: colorsLocal.surfaceSecondary, borderColor: colorsLocal.border }]}>
                      <ThemedText style={[Typography.footnote, { color: colorsLocal.textSecondary, marginBottom: Spacing.xs }]}>
                        Saving this will update {cascadeWarning.length} related conversion{cascadeWarning.length > 1 ? 's' : ''}:
                      </ThemedText>
                      {cascadeWarning.map((item) => {
                        const oldAmt = (item.oldQIBS * servingSizeNum).toFixed(2);
                        const newAmt = (item.newQIBS * servingSizeNum).toFixed(2);
                        return (
                          <ThemedText key={item.unitName} style={[Typography.footnote, { color: colorsLocal.text }]}>
                            {item.unitName}: {oldAmt} {servingUnit} → {newAmt} {servingUnit}
                          </ThemedText>
                        );
                      })}
                    </View>
                  )}

                  {/* Action buttons */}
                  <View style={styles.formActions}>
                    <View style={styles.formActionsRight}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.cancelButton}
                        onPress={handleCancelLocal}
                        disabled={isSavingUnit}
                      >
                        <ThemedText style={[Typography.body, { color: colorsLocal.text }]}>Cancel</ThemedText>
                      </TouchableOpacity>
                      {cascadeWarning && cascadeWarning.length > 0 ? (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={[styles.saveButton, { backgroundColor: colorsLocal.tint, opacity: isSavingUnit ? 0.6 : 1 }]}
                          onPress={() => handleSave(cascadeWarning)}
                          disabled={isSavingUnit || !canSaveLocal}
                        >
                          {isSavingUnit ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <ThemedText style={[Typography.subhead, { color: '#FFFFFF' }]}>
                              Save + update related
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={[styles.saveButton, { backgroundColor: colorsLocal.tint, opacity: (isSavingUnit || !canSaveLocal) ? 0.6 : 1 }]}
                          onPress={() => handleSave()}
                          disabled={isSavingUnit || !canSaveLocal}
                        >
                          {isSavingUnit ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <ThemedText style={[Typography.subhead, { color: '#FFFFFF' }]}>Save</ThemedText>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

        </Pressable>
      </Pressable>
    );

    onOverlayRender?.(overlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, pendingToUnit, formFromUnit, formFromQty, formToQty, cascadeWarning, isSavingUnit, servingSizeNum, servingUnit, allConversions, onOverlayRender, noUnitSelection, colorScheme, closePanel, openEditForm, openAddForm, openFromPicker, selectFromUnit, handleSave, handleDelete]);

  // Cleanup overlay on unmount
  useEffect(() => {
    return () => {
      onOverlayRender?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Old behavior (noUnitSelection=false)
  // ---------------------------------------------------------------------------

  if (!noUnitSelection) {
    const unitTiles = [servingUnit, ...allConversions.map((c) => c.unitName)].filter(
      (u, i, a) => a.indexOf(u) === i,
    );
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
                  onPress={() => props.onSelectUnit?.(u)}
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
              onPress={openPickerStep}
            >
              <ThemedText style={[Typography.subhead, { color: colors.textTertiary }]}>+</ThemedText>
            </Pressable>
          </ScrollView>
        </View>
        {/* Legacy: no inline panel in old mode */}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // New interaction model (noUnitSelection=true)
  // ---------------------------------------------------------------------------

  const conversionPills = allConversions.filter((c) => c.unitName !== 'servings');

  return (
    <View>
      {/* Pills row only — overlay is lifted to parent via onOverlayRender */}
      <View style={styles.unitPillsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.unitPills}
        >
          {conversionPills.map((c) => {
            const isActive = panel.mode === 'preview' && panel.unitName === c.unitName;
            return (
              <Pressable
                key={c.unitName}
                style={[
                  styles.unitPill,
                  {
                    backgroundColor: colors.surfaceSecondary,
                    borderColor: isActive ? colors.tint : colors.border,
                  },
                ]}
                onPress={() => handlePillPress(c.unitName)}
              >
                <ThemedText style={[Typography.subhead, { color: colors.text }]}>
                  {c.unitName}
                </ThemedText>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.unitPill, { backgroundColor: 'transparent', borderColor: colors.borderLight }]}
            onPress={openPickerStep}
          >
            <ThemedText style={[Typography.subhead, { color: colors.textTertiary }]}>+</ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

export default memo(FoodUnitConversionsBlock);

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
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  floatingCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingCardPreview: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  floatingCardPicker: {
    maxHeight: 420,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editIconButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  pickerList: {
    maxHeight: 200,
  },
  pickerListContent: {
    paddingBottom: Spacing.sm,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  conversionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  qtyInput: {
    width: 56,
    height: 40,
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 0,
    textAlign: 'center',
  },
  unitDropdown: {
    flex: 1,
    minWidth: 60,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  lockedUnitLabel: {
    flex: 1,
    minWidth: 60,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
  },
  cascadeBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  formActionsRight: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    marginLeft: 'auto',
  },
  cancelButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  saveButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    minWidth: 60,
    alignItems: 'center',
  },
});
