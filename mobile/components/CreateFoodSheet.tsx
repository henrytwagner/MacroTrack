import React, { useState, useEffect } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { CustomFood, CommunityFood, FoodUnitConversion } from '@shared/types';
import * as api from '@/services/api';
import FoodUnitConversionsBlock from '@/components/FoodUnitConversionsBlock';
import { SERVING_UNITS } from '@/constants/units';

/** Units that can be the base (serving size) unit; exclude abstract "servings". */
const BASE_UNIT_OPTIONS = SERVING_UNITS.filter((u) => u !== 'servings');

interface CreateFoodSheetProps {
  visible: boolean;
  prefillName?: string;
  editingFood?: CustomFood;
  intent?: 'custom' | 'community';
  prefillCommunityFood?: CommunityFood;
  prefillBarcode?: string;
  /** When publishing, the ID of the CustomFood being converted. */
  sourceCustomFoodId?: string;
  onDismiss: () => void;
  onSaved?: (food?: CustomFood) => void;
  /** Called after deleting a custom food in edit mode so parent can refresh. */
  onDeleted?: () => void;
}

interface FieldInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  unit?: string;
  required?: boolean;
  placeholder?: string;
  accentColor?: string;
  isLast?: boolean;
  colors: (typeof Colors)['light'];
}

function FieldInput({
  label,
  value,
  onChangeText,
  unit,
  required,
  placeholder = '0',
  accentColor,
  isLast,
  colors,
}: FieldInputProps) {
  return (
    <>
      <View style={styles.macroRow}>
        {accentColor ? (
          <View style={[styles.macroDot, { backgroundColor: accentColor }]} />
        ) : (
          <View style={[styles.macroDot, { backgroundColor: colors.textTertiary }]} />
        )}
        <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
          {label}
          {required && (
            <ThemedText style={[Typography.caption1, { color: colors.destructive }]}> *</ThemedText>
          )}
        </ThemedText>
        <TextInput
          style={[styles.macroInput, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
        />
        {unit && (
          <ThemedText style={[styles.macroUnit, { color: colors.textSecondary }]}>
            {unit}
          </ThemedText>
        )}
      </View>
      {!isLast && (
        <View style={[styles.macroRowDivider, { backgroundColor: colors.borderLight }]} />
      )}
    </>
  );
}

export default function CreateFoodSheet({
  visible,
  prefillName,
  editingFood,
  intent = 'custom',
  prefillCommunityFood,
  prefillBarcode,
  sourceCustomFoodId,
  onDismiss,
  onSaved,
  onDeleted,
}: CreateFoodSheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [publishMode, setPublishMode] = useState<'local' | 'community'>(
    intent === 'community' ? 'community' : 'local',
  );

  const [name, setName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState<string>('g');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const [showOptional, setShowOptional] = useState(false);
  const [sodium, setSodium] = useState('');
  const [cholesterol, setCholesterol] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [saturatedFat, setSaturatedFat] = useState('');
  const [transFat, setTransFat] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  /** Pending conversions when creating a new food; applied after the food is saved. */
  const [pendingUnitConversions, setPendingUnitConversions] = useState<
    { unitName: string; quantityInBaseServings: number }[]
  >([]);
  /** Saved conversions when editing; synced from block via onConversionsChange. */
  const [unitConfigs, setUnitConfigs] = useState<FoodUnitConversion[]>([]);
  /** Overlay JSX lifted from FoodUnitConversionsBlock to avoid nested Modal artifacts. */
  const [unitOverlay, setUnitOverlay] = useState<React.ReactNode>(null);

  useEffect(() => {
    if (!visible) return;

    setPublishMode(intent === 'community' ? 'community' : 'local');

    const prefill = editingFood ?? prefillCommunityFood;
    if (prefill) {
      setName(prefill.name);
      setBrandName(
        'brandName' in prefill && prefill.brandName ? prefill.brandName : '',
      );
      const ss = 'servingSize' in prefill ? prefill.servingSize : (prefill as CommunityFood).defaultServingSize;
      const su = 'servingUnit' in prefill ? prefill.servingUnit : (prefill as CommunityFood).defaultServingUnit;
      setServingSize(String(ss));
      setServingUnit(su);
      setCalories(String(prefill.calories));
      setProtein(String(prefill.proteinG));
      setCarbs(String(prefill.carbsG));
      setFat(String(prefill.fatG));
      if (prefill.sodiumMg != null) setSodium(String(prefill.sodiumMg));
      if (prefill.cholesterolMg != null) setCholesterol(String(prefill.cholesterolMg));
      if (prefill.fiberG != null) setFiber(String(prefill.fiberG));
      if (prefill.sugarG != null) setSugar(String(prefill.sugarG));
      if (prefill.saturatedFatG != null) setSaturatedFat(String(prefill.saturatedFatG));
      if (prefill.transFatG != null) setTransFat(String(prefill.transFatG));
      const hasOptional =
        prefill.sodiumMg != null ||
        prefill.cholesterolMg != null ||
        prefill.fiberG != null ||
        prefill.sugarG != null ||
        prefill.saturatedFatG != null ||
        prefill.transFatG != null;
      setShowOptional(hasOptional);
      setPendingUnitConversions([]);
    } else {
      setName(prefillName || '');
      setBrandName('');
      setServingSize('100');
      setServingUnit('g');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setSodium('');
      setCholesterol('');
      setFiber('');
      setSugar('');
      setSaturatedFat('');
      setTransFat('');
      setShowOptional(false);
      setPendingUnitConversions([]);
    }
  }, [editingFood, prefillCommunityFood, prefillName, visible, intent]);

  const baseServingNum = Number(servingSize) || 1;

  const handleServingUnitChange = (newUnit: string) => {
    if (newUnit === servingUnit) return;

    const adoptedPending = pendingUnitConversions.find((c) => c.unitName === newUnit);
    const adoptedSaved = unitConfigs.find((c) => c.unitName === newUnit);
    const adopted = adoptedPending ?? adoptedSaved;

    if (adopted) {
      const adoptedQIBS = adopted.quantityInBaseServings;

      const newPending = pendingUnitConversions
        .filter((c) => c.unitName !== newUnit)
        .map((c) => ({ ...c, quantityInBaseServings: c.quantityInBaseServings / adoptedQIBS }));
      setPendingUnitConversions(newPending);

      if (editingFood) {
        const newSaved = unitConfigs.filter((c) => c.unitName !== newUnit);
        const deleteOp = adoptedSaved ? api.deleteFoodUnitConversion(adoptedSaved.id) : Promise.resolve();
        deleteOp
          .then(() =>
            Promise.all(
              newSaved.map((c) =>
                api.updateFoodUnitConversion(c.id, {
                  quantityInBaseServings: c.quantityInBaseServings / adoptedQIBS,
                }),
              ),
            ),
          )
          .then((updated) => {
            const next = updated.length > 0 ? updated : [];
            setUnitConfigs(next);
          })
          .catch(() => {
            setUnitConfigs(unitConfigs.filter((c) => c.unitName !== newUnit));
          });
      }

      setServingSize('1');
      setServingUnit(newUnit);
    } else {
      setPendingUnitConversions([]);
      if (editingFood && unitConfigs.length > 0) {
        Promise.all(unitConfigs.map((c) => api.deleteFoodUnitConversion(c.id)))
          .then(() => setUnitConfigs([]))
          .catch(() => setUnitConfigs([]));
      } else if (editingFood) {
        setUnitConfigs([]);
      }
      setServingUnit(newUnit);
    }
  };

  const isValid =
    name.trim().length > 0 &&
    Number(servingSize) > 0 &&
    calories.length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);

    const optionalMacros = {
      ...(sodium ? { sodiumMg: Number(sodium) } : {}),
      ...(cholesterol ? { cholesterolMg: Number(cholesterol) } : {}),
      ...(fiber ? { fiberG: Number(fiber) } : {}),
      ...(sugar ? { sugarG: Number(sugar) } : {}),
      ...(saturatedFat ? { saturatedFatG: Number(saturatedFat) } : {}),
      ...(transFat ? { transFatG: Number(transFat) } : {}),
    };

    try {
      const willPublish = publishMode === 'community';

      if (willPublish) {
        if (editingFood) {
          const customData = {
            name: name.trim(),
            servingSize: Number(servingSize) || 1,
            servingUnit,
            calories: Number(calories) || 0,
            proteinG: Number(protein) || 0,
            carbsG: Number(carbs) || 0,
            fatG: Number(fat) || 0,
            ...optionalMacros,
          };
          await api.updateCustomFood(editingFood.id, customData);
          await api.publishCustomFood(editingFood.id, {
            brandName: brandName.trim() || undefined,
          });
        } else if (sourceCustomFoodId) {
          await api.publishCustomFood(sourceCustomFoodId, {
            brandName: brandName.trim() || undefined,
            barcode: prefillBarcode || undefined,
          });
        } else {
          await api.createCommunityFood({
            name: name.trim(),
            brandName: brandName.trim() || undefined,
            defaultServingSize: Number(servingSize) || 1,
            defaultServingUnit: servingUnit,
            calories: Number(calories) || 0,
            proteinG: Number(protein) || 0,
            carbsG: Number(carbs) || 0,
            fatG: Number(fat) || 0,
            barcode: prefillBarcode || undefined,
            ...optionalMacros,
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved?.();
      } else {
        const data = {
          name: name.trim(),
          servingSize: Number(servingSize) || 1,
          servingUnit,
          calories: Number(calories) || 0,
          proteinG: Number(protein) || 0,
          carbsG: Number(carbs) || 0,
          fatG: Number(fat) || 0,
          ...optionalMacros,
        };

        let result: CustomFood;
        if (editingFood) {
          result = await api.updateCustomFood(editingFood.id, data);
        } else {
          result = await api.createCustomFood(data);
          for (const pending of pendingUnitConversions) {
            try {
              await api.createFoodUnitConversion({
                unitName: pending.unitName,
                quantityInBaseServings: pending.quantityInBaseServings,
                customFoodId: result.id,
              });
            } catch (unitErr) {
              const msg =
                unitErr instanceof api.ApiError ? unitErr.message : (unitErr as Error)?.message ?? 'Unknown error';
              Alert.alert(
                'Food created, some units could not be saved',
                `"${pending.unitName}" could not be added: ${msg}. You can add it later by editing this food.`,
              );
            }
          }
          setPendingUnitConversions([]);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved?.(result);
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not save. Please try again.';
      Alert.alert('Could not save', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editingFood) return;
    Alert.alert(
      'Delete this personal food?',
      'It will be removed from My Foods. Existing log entries will keep their saved nutrition but will no longer link to this food.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteCustomFood(editingFood.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onDeleted?.();
              onDismiss();
            } catch (e) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              const message =
                e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not delete.';
              Alert.alert('Could not delete', message);
            }
          },
        },
      ],
    );
  };

  const isEditing = !!editingFood;
  const titleText = isEditing ? 'Edit Custom Food' : 'Create Custom Food';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: 'rgba(128,128,128,0.2)' }]}>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <ThemedText style={[Typography.body, { color: colors.tint }]}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>
            {titleText}
          </ThemedText>
          <Pressable onPress={handleSave} disabled={!isValid || isSaving} hitSlop={8}>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <ThemedText
                style={[
                  Typography.body,
                  { color: isValid ? colors.tint : colors.textTertiary, fontWeight: '600' },
                ]}
              >
                Save
              </ThemedText>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.sheetContent}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Publish toggle */}
            <View style={[styles.publishToggleWrap, { backgroundColor: colors.surfaceSecondary }]}>
              <Pressable
                style={[
                  styles.publishSegment,
                  publishMode === 'local' && [styles.publishSegmentActive, { backgroundColor: colors.surface }],
                ]}
                onPress={() => setPublishMode('local')}
              >
                <Ionicons
                  name="person-outline"
                  size={15}
                  color={publishMode === 'local' ? colors.tint : colors.textSecondary}
                />
                <ThemedText
                  style={[
                    Typography.subhead,
                    { color: publishMode === 'local' ? colors.tint : colors.textSecondary, fontWeight: '500' },
                  ]}
                >
                  My Foods
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.publishSegment,
                  publishMode === 'community' && [styles.publishSegmentActive, { backgroundColor: colors.surface }],
                ]}
                onPress={() => setPublishMode('community')}
              >
                <Ionicons
                  name="people-outline"
                  size={15}
                  color={publishMode === 'community' ? colors.tint : colors.textSecondary}
                />
                <ThemedText
                  style={[
                    Typography.subhead,
                    { color: publishMode === 'community' ? colors.tint : colors.textSecondary, fontWeight: '500' },
                  ]}
                >
                  Community
                </ThemedText>
              </Pressable>
            </View>

            {/* Name card */}
            <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>NAME</ThemedText>
            <View style={[styles.sectionCard, { backgroundColor: colors.surfaceSecondary }]}>
              <TextInput
                style={[styles.nameCardInput, { color: colors.text }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Mom's Chili"
                placeholderTextColor={colors.textTertiary}
                autoFocus={!isEditing}
                returnKeyType="next"
              />
              {publishMode === 'community' && (
                <>
                  <View style={[styles.nameCardDivider, { backgroundColor: colors.borderLight }]} />
                  <TextInput
                    style={[styles.nameCardInput, { color: colors.text }]}
                    value={brandName}
                    onChangeText={setBrandName}
                    placeholder="Brand name (optional)"
                    placeholderTextColor={colors.textTertiary}
                    returnKeyType="next"
                  />
                </>
              )}
            </View>

            {/* Serving Size card */}
            <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>SERVING SIZE</ThemedText>
            <View style={[styles.sectionCard, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={styles.servingCardRow}>
                <TextInput
                  style={[styles.servingSizeInput, { color: colors.text, borderColor: colors.border }]}
                  value={servingSize}
                  onChangeText={setServingSize}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="done"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.servingSizeUnitPills}
                  style={{ flex: 1 }}
                >
                  {BASE_UNIT_OPTIONS.map((u) => {
                    const isSelected = servingUnit === u;
                    return (
                      <Pressable
                        key={u}
                        style={[
                          styles.servingSizeUnitPill,
                          {
                            backgroundColor: isSelected ? colors.tint : colors.surface,
                            borderColor: isSelected ? colors.tint : colors.border,
                          },
                        ]}
                        onPress={() => handleServingUnitChange(u)}
                      >
                        <ThemedText
                          style={[Typography.caption1, { color: isSelected ? '#FFFFFF' : colors.text }]}
                        >
                          {u}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* Units card */}
            <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>UNITS</ThemedText>
            <View style={[styles.sectionCard, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={{ padding: Spacing.md }}>
                {editingFood ? (
                  <FoodUnitConversionsBlock
                    mode="saved"
                    customFoodId={editingFood.id}
                    servingSize={baseServingNum}
                    servingUnit={servingUnit}
                    noUnitSelection
                    onConversionsChange={setUnitConfigs}
                    onOverlayRender={setUnitOverlay}
                  />
                ) : (
                  <FoodUnitConversionsBlock
                    mode="draft"
                    servingSize={servingSize}
                    servingUnit={servingUnit}
                    pendingConversions={pendingUnitConversions}
                    onPendingConversionsChange={setPendingUnitConversions}
                    noUnitSelection
                    onOverlayRender={setUnitOverlay}
                  />
                )}
              </View>
            </View>

            {/* Nutrition card */}
            <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>NUTRITION PER SERVING</ThemedText>
            <View style={[styles.sectionCard, { backgroundColor: colors.surfaceSecondary }]}>
              <FieldInput
                label="Calories"
                value={calories}
                onChangeText={setCalories}
                unit="kcal"
                required
                accentColor={colors.caloriesAccent}
                colors={colors}
              />
              <FieldInput
                label="Protein"
                value={protein}
                onChangeText={setProtein}
                unit="g"
                required
                accentColor={colors.proteinAccent}
                colors={colors}
              />
              <FieldInput
                label="Carbs"
                value={carbs}
                onChangeText={setCarbs}
                unit="g"
                required
                accentColor={colors.carbsAccent}
                colors={colors}
              />
              <FieldInput
                label="Fat"
                value={fat}
                onChangeText={setFat}
                unit="g"
                required
                accentColor={colors.fatAccent}
                isLast
                colors={colors}
              />
            </View>

            {/* More details toggle */}
            <Pressable
              style={styles.moreDetailsToggle}
              onPress={() => setShowOptional(!showOptional)}
            >
              <Ionicons
                name={showOptional ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.tint}
              />
              <ThemedText style={[Typography.subhead, { color: colors.tint }]}>
                {showOptional ? 'Hide details' : 'More details'}
              </ThemedText>
            </Pressable>

            {showOptional && (
              <>
                <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>OPTIONAL</ThemedText>
                <View style={[styles.sectionCard, { backgroundColor: colors.surfaceSecondary }]}>
                  <FieldInput label="Sodium" value={sodium} onChangeText={setSodium} unit="mg" colors={colors} />
                  <FieldInput label="Cholesterol" value={cholesterol} onChangeText={setCholesterol} unit="mg" colors={colors} />
                  <FieldInput label="Fiber" value={fiber} onChangeText={setFiber} unit="g" colors={colors} />
                  <FieldInput label="Sugar" value={sugar} onChangeText={setSugar} unit="g" colors={colors} />
                  <FieldInput label="Saturated Fat" value={saturatedFat} onChangeText={setSaturatedFat} unit="g" colors={colors} />
                  <FieldInput label="Trans Fat" value={transFat} onChangeText={setTransFat} unit="g" isLast colors={colors} />
                </View>
              </>
            )}

            {isEditing && (
              <Pressable style={styles.deleteButton} onPress={handleDelete}>
                <ThemedText style={[Typography.body, { color: colors.destructive }]}>Delete Food</ThemedText>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        {unitOverlay != null && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {unitOverlay}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
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
  sectionLabel: {
    ...Typography.footnote,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  nameCardInput: {
    ...Typography.body,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  nameCardDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
  servingCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  servingSizeInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 72,
    textAlign: 'center',
  },
  servingSizeUnitPills: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  servingSizeUnitPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  publishToggleWrap: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  publishSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
  },
  publishSegmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroInput: {
    ...Typography.body,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
  },
  macroUnit: {
    ...Typography.footnote,
    minWidth: 28,
  },
  macroRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg + 8 + Spacing.md,
  },
  moreDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  deleteButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
});
