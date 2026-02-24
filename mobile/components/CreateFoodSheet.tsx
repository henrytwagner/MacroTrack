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
import type { CustomFood, NutritionUnit } from '@shared/types';
import * as api from '@/services/api';

const SERVING_UNITS: NutritionUnit[] = ['g', 'oz', 'cups', 'servings', 'slices', 'pieces', 'ml', 'tbsp', 'tsp'];

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
  keyboardType?: 'default' | 'numeric';
  colors: (typeof Colors)['light'];
}

function FieldInput({
  label,
  value,
  onChangeText,
  unit,
  required,
  placeholder = '0',
  keyboardType = 'numeric',
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
          keyboardType={keyboardType}
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
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['92%'], []);

  const [name, setName] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [servingUnit, setServingUnit] = useState<string>('servings');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // Optional fields
  const [showOptional, setShowOptional] = useState(false);
  const [sodium, setSodium] = useState('');
  const [cholesterol, setCholesterol] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [saturatedFat, setSaturatedFat] = useState('');
  const [transFat, setTransFat] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
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
    } else {
      setName(prefillName || '');
      setServingSize('');
      setServingUnit('servings');
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
    }
  }, [editingFood, prefillName, visible]);

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
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved?.(result);
      sheetRef.current?.close();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  const isEditing = !!editingFood;

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
        <ThemedText style={[Typography.title2, { color: colors.text, marginBottom: Spacing.xxl }]}>
          {isEditing ? 'Edit Custom Food' : 'Create Custom Food'}
        </ThemedText>

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

        {/* Serving Size */}
        <View style={[styles.section, { borderBottomColor: colors.borderLight }]}>
          <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
            Serving Size
          </ThemedText>
          <View style={styles.servingSizeRow}>
            <TextInput
              style={[styles.servingSizeInput, { color: colors.text, borderColor: colors.border }]}
              value={servingSize}
              onChangeText={setServingSize}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.unitPills}
            >
              {SERVING_UNITS.map((u) => (
                <Pressable
                  key={u}
                  style={[
                    styles.unitPill,
                    {
                      backgroundColor: servingUnit === u ? colors.tint : colors.surfaceSecondary,
                      borderColor: servingUnit === u ? colors.tint : colors.border,
                    },
                  ]}
                  onPress={() => setServingUnit(u)}
                >
                  <ThemedText
                    style={[
                      Typography.caption1,
                      { color: servingUnit === u ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {u}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
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
    </BottomSheet>
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
    gap: Spacing.md,
  },
  servingSizeInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  unitPills: {
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  unitPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
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
