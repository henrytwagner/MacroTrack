import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { FoodEntry, NutritionUnit } from '@shared/types';
import * as api from '@/services/api';

const UNITS: NutritionUnit[] = ['g', 'oz', 'cups', 'servings', 'slices', 'pieces'];

interface EditEntrySheetProps {
  entry: FoodEntry | null;
  onDismiss: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export default function EditEntrySheet({
  entry,
  onDismiss,
  onSaved,
  onDeleted,
}: EditEntrySheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['55%'], []);

  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<string>('g');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (entry) {
      setQuantity(String(entry.quantity));
      setUnit(entry.unit);
      sheetRef.current?.present();
    }
  }, [entry]);

  const scaledMacros = useMemo(() => {
    if (!entry) return null;
    const newQty = Number(quantity) || 0;
    const origQty = entry.quantity || 1;
    const ratio = origQty > 0 ? newQty / origQty : 1;
    return {
      calories: Math.round(entry.calories * ratio),
      proteinG: Math.round(entry.proteinG * ratio * 10) / 10,
      carbsG: Math.round(entry.carbsG * ratio * 10) / 10,
      fatG: Math.round(entry.fatG * ratio * 10) / 10,
    };
  }, [entry, quantity]);

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

  const handleSave = async () => {
    if (!entry || !scaledMacros) return;
    setIsSaving(true);
    try {
      await api.updateEntry(entry.id, {
        quantity: Number(quantity) || 1,
        unit,
        ...scaledMacros,
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
    if (!entry) return;
    setIsDeleting(true);
    try {
      await api.deleteEntry(entry.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDeleted?.();
      sheetRef.current?.close();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!entry) return null;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.sheetHandle }}
    >
      <View style={styles.content}>
        <ThemedText style={[Typography.title3, { color: colors.text }]}>
          {entry.name}
        </ThemedText>
        <View style={[styles.sourceBadge, { backgroundColor: colors.surfaceSecondary }]}>
          <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
            {entry.source === 'CUSTOM' ? 'Custom Food' : 'USDA Database'}
          </ThemedText>
        </View>

        {scaledMacros && (
          <View style={[styles.macroSummary, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={styles.macroItem}>
              <ThemedText style={[Typography.headline, { color: colors.caloriesAccent }]}>
                {scaledMacros.calories}
              </ThemedText>
              <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>cal</ThemedText>
            </View>
            <View style={styles.macroItem}>
              <ThemedText style={[Typography.headline, { color: colors.proteinAccent }]}>
                {scaledMacros.proteinG}g
              </ThemedText>
              <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>protein</ThemedText>
            </View>
            <View style={styles.macroItem}>
              <ThemedText style={[Typography.headline, { color: colors.carbsAccent }]}>
                {scaledMacros.carbsG}g
              </ThemedText>
              <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>carbs</ThemedText>
            </View>
            <View style={styles.macroItem}>
              <ThemedText style={[Typography.headline, { color: colors.fatAccent }]}>
                {scaledMacros.fatG}g
              </ThemedText>
              <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>fat</ThemedText>
            </View>
          </View>
        )}

        <View style={styles.quantityRow}>
          <TextInput
            style={[styles.quantityInput, { color: colors.text, borderColor: colors.border }]}
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
                    Typography.caption1,
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
              styles.saveButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
              isSaving && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save</ThemedText>
            )}
          </Pressable>

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
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
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
  quantityRow: {
    gap: Spacing.md,
  },
  quantityInput: {
    ...Typography.title3,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
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
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  saveButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
  deleteButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: 1,
  },
  deleteButtonText: {
    ...Typography.headline,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
