import { useState, useEffect } from 'react';
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
import type { CustomFood, FoodUnitConversion } from '@shared/types';
import * as api from '@/services/api';
import FoodUnitConversionsBlock from '@/components/FoodUnitConversionsBlock';
import { SERVING_UNITS } from '@/constants/units';

/** Units that can be the base (serving size) unit; exclude abstract "servings". */
const BASE_UNIT_OPTIONS = SERVING_UNITS.filter((u) => u !== 'servings');

interface CreateFoodSheetProps {
  visible: boolean;
  prefillName?: string;
  editingFood?: CustomFood;
  onDismiss: () => void;
  onSaved?: (food: CustomFood) => void;
}

interface FieldInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  unit?: string;
  required?: boolean;
  placeholder?: string;
  colors: (typeof Colors)['light'];
}

function FieldInput({
  label,
  value,
  onChangeText,
  unit,
  required,
  placeholder = '0',
  colors,
}: FieldInputProps) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelContainer}>
        <ThemedText style={[Typography.body, { color: colors.text }]}>
          {label}
        </ThemedText>
        {required && (
          <ThemedText style={[Typography.caption1, { color: colors.destructive }]}>*</ThemedText>
        )}
      </View>
      <View style={styles.fieldInputContainer}>
        <TextInput
          style={[styles.fieldInput, { color: colors.text, borderColor: colors.border }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
        />
        {unit && (
          <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
            {unit}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

export default function CreateFoodSheet({
  visible,
  prefillName,
  editingFood,
  onDismiss,
  onSaved,
}: CreateFoodSheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [name, setName] = useState('');
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
    Array<{ unitName: string; quantityInBaseServings: number }>
  >([]);
  /** Saved conversions when editing; synced from block via onConversionsChange. */
  const [unitConfigs, setUnitConfigs] = useState<FoodUnitConversion[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (editingFood) {
      setName(editingFood.name);
      setServingSize(String(editingFood.servingSize));
      setServingUnit(editingFood.servingUnit);
      setCalories(String(editingFood.calories));
      setProtein(String(editingFood.proteinG));
      setCarbs(String(editingFood.carbsG));
      setFat(String(editingFood.fatG));
      if (editingFood.sodiumMg != null) setSodium(String(editingFood.sodiumMg));
      if (editingFood.cholesterolMg != null) setCholesterol(String(editingFood.cholesterolMg));
      if (editingFood.fiberG != null) setFiber(String(editingFood.fiberG));
      if (editingFood.sugarG != null) setSugar(String(editingFood.sugarG));
      if (editingFood.saturatedFatG != null) setSaturatedFat(String(editingFood.saturatedFatG));
      if (editingFood.transFatG != null) setTransFat(String(editingFood.transFatG));
      const hasOptional =
        editingFood.sodiumMg != null ||
        editingFood.cholesterolMg != null ||
        editingFood.fiberG != null ||
        editingFood.sugarG != null ||
        editingFood.saturatedFatG != null ||
        editingFood.transFatG != null;
      setShowOptional(hasOptional);
      setPendingUnitConversions([]);
    } else {
      setName(prefillName || '');
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
  }, [editingFood, prefillName, visible]);

  const baseServingNum = Number(servingSize) || 1;
  const allConversions = editingFood ? unitConfigs : pendingUnitConversions;

  const handleServingUnitChange = (newUnit: string) => {
    if (newUnit === servingUnit) return;
    setPendingUnitConversions([]);
    if (editingFood && unitConfigs.length > 0) {
      Promise.all(unitConfigs.map((c) => api.deleteFoodUnitConversion(c.id)))
        .then(() => setUnitConfigs([]))
        .catch(() => setUnitConfigs([]));
    } else if (editingFood) {
      setUnitConfigs([]);
    }
    setServingUnit(newUnit);
  };

  const isValid =
    name.trim().length > 0 &&
    Number(servingSize) > 0 &&
    calories.length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);

    const data = {
      name: name.trim(),
      servingSize: Number(servingSize) || 1,
      servingUnit,
      calories: Number(calories) || 0,
      proteinG: Number(protein) || 0,
      carbsG: Number(carbs) || 0,
      fatG: Number(fat) || 0,
      ...(sodium ? { sodiumMg: Number(sodium) } : {}),
      ...(cholesterol ? { cholesterolMg: Number(cholesterol) } : {}),
      ...(fiber ? { fiberG: Number(fiber) } : {}),
      ...(sugar ? { sugarG: Number(sugar) } : {}),
      ...(saturatedFat ? { saturatedFatG: Number(saturatedFat) } : {}),
      ...(transFat ? { transFatG: Number(transFat) } : {}),
    };

    try {
      let result: CustomFood;
      if (editingFood) {
        result = await api.updateCustomFood(editingFood.id, data);
      } else {
        result = await api.createCustomFood(data);
        // Apply pending unit conversions to the new food.
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
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message =
        e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not save. Please try again.';
      Alert.alert('Could not save', message);
    } finally {
      setIsSaving(false);
    }
  };

  const isEditing = !!editingFood;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <ThemedText style={[Typography.body, { color: colors.tint }]}>
              Cancel
            </ThemedText>
          </Pressable>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>
            {isEditing ? 'Edit Custom Food' : 'Create Custom Food'}
          </ThemedText>
          <View style={{ width: 50 }} />
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
            {/* Name */}
            <View style={[styles.section, { borderBottomColor: colors.borderLight }]}>
              <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
                Name
              </ThemedText>
              <TextInput
                style={[styles.nameInput, { color: colors.text, borderColor: colors.border }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Mom's Chili"
                placeholderTextColor={colors.textTertiary}
                autoFocus={!isEditing}
                returnKeyType="next"
              />
            </View>

            {/* Serving Size — amount and base unit; conversions use this unit */}
            <View style={[styles.section, { borderBottomColor: colors.borderLight }]}>
              <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
                Serving Size
              </ThemedText>
              <View style={styles.servingSizeRow}>
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
                >
                  {BASE_UNIT_OPTIONS.map((u) => {
                    const isSelected = servingUnit === u;
                    return (
                      <Pressable
                        key={u}
                        style={[
                          styles.servingSizeUnitPill,
                          {
                            backgroundColor: isSelected ? colors.tint : colors.surfaceSecondary,
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
              <ThemedText style={[Typography.caption1, { color: colors.textTertiary, marginTop: Spacing.xs }]}>
                Add conversions below (e.g. 1 cup = 240 g).
              </ThemedText>
            </View>

            {/* Units — choose base unit, add conversions, and see list */}
            <View style={[styles.section, { borderBottomColor: colors.borderLight }]}>
              <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.xs }]}>
                Units
              </ThemedText>
              <ThemedText style={[Typography.caption1, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                Add conversions using the base unit above (e.g. 1 cup = 240 g).
              </ThemedText>
              {editingFood ? (
                <FoodUnitConversionsBlock
                  mode="saved"
                  customFoodId={editingFood.id}
                  servingSize={baseServingNum}
                  servingUnit={servingUnit}
                  selectedUnit={servingUnit}
                  onSelectUnit={(u) => {
                    if (u !== 'servings') handleServingUnitChange(u);
                  }}
                  onConversionsChange={setUnitConfigs}
                />
              ) : (
                <FoodUnitConversionsBlock
                  mode="draft"
                  servingSize={servingSize}
                  servingUnit={servingUnit}
                  pendingConversions={pendingUnitConversions}
                  onPendingConversionsChange={setPendingUnitConversions}
                  selectedUnit={servingUnit}
                  onSelectUnit={(u) => {
                    if (u !== 'servings') handleServingUnitChange(u);
                  }}
                />
              )}
              {allConversions.some((c) => c.unitName !== 'servings') && (
                <View style={[styles.conversionsList, { borderTopColor: colors.borderLight }]}>
                  <ThemedText style={[Typography.caption1, { color: colors.textSecondary, marginBottom: Spacing.xs }]}>
                    In place:
                  </ThemedText>
                  {allConversions
                    .filter((c) => c.unitName !== 'servings')
                    .map((c) => {
                      const name = c.unitName;
                      const q = c.quantityInBaseServings;
                      const amount = (q * baseServingNum).toFixed(2);
                      return (
                        <ThemedText key={name} style={[Typography.subhead, { color: colors.text }]}>
                          1 {name} = {amount} {servingUnit}
                        </ThemedText>
                      );
                    })}
                </View>
              )}
            </View>

            {/* Required Macros */}
            <View style={[styles.section, { borderBottomColor: colors.borderLight }]}>
              <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
                Nutrition per Serving
              </ThemedText>
              <FieldInput label="Calories" value={calories} onChangeText={setCalories} unit="kcal" required colors={colors} />
              <FieldInput label="Protein" value={protein} onChangeText={setProtein} unit="g" required colors={colors} />
              <FieldInput label="Carbs" value={carbs} onChangeText={setCarbs} unit="g" required colors={colors} />
              <FieldInput label="Fat" value={fat} onChangeText={setFat} unit="g" required colors={colors} />
            </View>

            {/* Optional Fields */}
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
              <View style={styles.optionalSection}>
                <FieldInput label="Sodium" value={sodium} onChangeText={setSodium} unit="mg" colors={colors} />
                <FieldInput label="Cholesterol" value={cholesterol} onChangeText={setCholesterol} unit="mg" colors={colors} />
                <FieldInput label="Fiber" value={fiber} onChangeText={setFiber} unit="g" colors={colors} />
                <FieldInput label="Sugar" value={sugar} onChangeText={setSugar} unit="g" colors={colors} />
                <FieldInput label="Saturated Fat" value={saturatedFat} onChangeText={setSaturatedFat} unit="g" colors={colors} />
                <FieldInput label="Trans Fat" value={transFat} onChangeText={setTransFat} unit="g" colors={colors} />
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
                (!isValid || isSaving) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={!isValid || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.saveButtonText}>
                  {isEditing ? 'Save Changes' : 'Create Food'}
                </ThemedText>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
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
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  sheetContent: {
    flex: 1,
  },
  sheetScrollContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
  },
  section: {
    paddingBottom: Spacing.lg,
    marginBottom: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  servingSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  servingSizeInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minWidth: 80,
  },
  servingSizeUnitPills: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  servingSizeUnitPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  conversionsList: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  fieldLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  fieldInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fieldInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    width: 80,
    textAlign: 'right',
  },
  moreDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  optionalSection: {
    marginBottom: Spacing.xxl,
  },
  saveButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: Spacing.lg,
  },
  saveButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
