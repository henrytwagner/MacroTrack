import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { FoodEntry, NutritionUnit } from '@shared/types';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useDateStore } from '@/stores/dateStore';
import * as api from '@/services/api';

const UNITS: NutritionUnit[] = ['g', 'oz', 'cups', 'servings', 'slices', 'pieces'];

export default function EditEntryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entries = useDailyLogStore((s) => s.entries);
  const fetchEntries = useDailyLogStore((s) => s.fetch);
  const selectedDate = useDateStore((s) => s.selectedDate);

  const entry = useMemo(
    () => (id ? entries.find((e) => e.id === id) ?? null : null),
    [id, entries],
  );

  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<string>('g');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (entry) {
      setQuantity(String(entry.quantity));
      setUnit(entry.unit);
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

  const handleSave = useCallback(async () => {
    if (!entry || !scaledMacros) return;
    setIsSaving(true);
    try {
      await api.updateEntry(entry.id, {
        quantity: Number(quantity) || 1,
        unit,
        ...scaledMacros,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchEntries(selectedDate);
      router.back();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [entry, quantity, unit, scaledMacros, selectedDate, fetchEntries, router]);

  const handleDelete = useCallback(async () => {
    if (!entry) return;
    setIsDeleting(true);
    try {
      await api.deleteEntry(entry.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchEntries(selectedDate);
      router.back();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsDeleting(false);
    }
  }, [entry, selectedDate, fetchEntries, router]);

  if (!id) {
    if (router.canGoBack()) router.back();
    return null;
  }

  if (!entry) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={28} color={colors.tint} />
          </Pressable>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>Edit entry</ThemedText>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.notFound}>
          <ThemedText style={[Typography.body, { color: colors.textSecondary }]}>Entry not found.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-back" size={28} color={colors.tint} />
        </Pressable>
        <ThemedText style={[Typography.headline, { color: colors.text }]} numberOfLines={1}>
          Edit quantity
        </ThemedText>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ThemedText style={[Typography.title3, { color: colors.text }]}>{entry.name}</ThemedText>
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
            <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>Quantity</ThemedText>
            <TextInput
              style={[styles.quantityInput, { color: colors.text, borderColor: colors.border }]}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
            />
            <ThemedText style={[Typography.caption1, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
              Unit
            </ThemedText>
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
                    style={[Typography.caption1, { color: unit === u ? '#FFFFFF' : colors.text }]}
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
                <ThemedText style={[styles.deleteButtonText, { color: colors.destructive }]}>Delete</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.lg,
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
    gap: Spacing.sm,
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
