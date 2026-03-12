import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GoalEditForm, type GoalEditFormValues } from '@/components/GoalEditForm';
import { useGoalStore } from '@/stores/goalStore';
import { useDateStore } from '@/stores/dateStore';

const INITIAL: GoalEditFormValues = {
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
};

export default function GoalsEditScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { selectedDate } = useDateStore();
  const { goalsByDate, isLoading, fetch, saveChange } = useGoalStore();

  const [values, setValues] = useState<GoalEditFormValues>(INITIAL);
  const [isSaving, setIsSaving] = useState(false);

  const goals = goalsByDate[selectedDate] ?? null;

  useEffect(() => {
    fetch(selectedDate);
  }, [fetch, selectedDate]);

  useEffect(() => {
    if (goals) {
      setValues({
        calories: String(goals.calories),
        protein: String(goals.proteinG),
        carbs: String(goals.carbsG),
        fat: String(goals.fatG),
      });
    }
  }, [goals]);

  const hasChanges = useCallback(() => {
    if (!goals) return values.calories || values.protein || values.carbs || values.fat;
    return (
      Number(values.calories) !== goals.calories ||
      Number(values.protein) !== goals.proteinG ||
      Number(values.carbs) !== goals.carbsG ||
      Number(values.fat) !== goals.fatG
    );
  }, [goals, values]);

  const handleSave = async () => {
    const cal = Number(values.calories) || 0;
    const pro = Number(values.protein) || 0;
    const car = Number(values.carbs) || 0;
    const f = Number(values.fat) || 0;
    if (cal === 0 && pro === 0 && car === 0 && f === 0) return;

    setIsSaving(true);
    await saveChange({
      effectiveDate: selectedDate,
      macros: { calories: cal, proteinG: pro, carbsG: car, fatG: f },
      goalType: 'MAINTAIN',
      aggressiveness: 'STANDARD',
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(false);
    router.back();
  };

  const canSave = hasChanges() && !isSaving;

  if (isLoading && !goals) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.navHeader, { borderBottomColor: colors.borderLight }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={26} color={colors.tint} />
          </Pressable>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>Set targets</ThemedText>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.navHeader, { borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-back" size={26} color={colors.tint} />
        </Pressable>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>Set targets</ThemedText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.lg }]}>
            Daily calorie and macro targets. Applies from the selected date onward.
          </ThemedText>
          <GoalEditForm values={values} onChange={setValues} colors={colors} />
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.tint, opacity: pressed || !canSave ? 0.6 : 1 },
            ]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save goals</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
  },
  saveButton: {
    marginTop: Spacing.xxl,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
});
