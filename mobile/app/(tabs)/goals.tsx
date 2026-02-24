import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGoalStore } from '@/stores/goalStore';

interface MacroInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  unit: string;
  accentColor: string;
  colors: (typeof Colors)['light'];
}

function MacroInput({ label, value, onChangeText, unit, accentColor, colors }: MacroInputProps) {
  return (
    <View style={[styles.inputCard, { backgroundColor: colors.surface }]}>
      <View style={styles.inputHeader}>
        <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
        <ThemedText style={[styles.inputLabel, { color: colors.text }]}>
          {label}
        </ThemedText>
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
        />
        <ThemedText style={[styles.unitText, { color: colors.textSecondary }]}>
          {unit}
        </ThemedText>
      </View>
    </View>
  );
}

export default function GoalsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { goals, isLoading, fetch, save } = useGoalStore();

  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (goals) {
      setCalories(String(goals.calories));
      setProtein(String(goals.proteinG));
      setCarbs(String(goals.carbsG));
      setFat(String(goals.fatG));
    }
  }, [goals]);

  const hasChanges = useCallback(() => {
    if (!goals) return calories || protein || carbs || fat;
    return (
      Number(calories) !== goals.calories ||
      Number(protein) !== goals.proteinG ||
      Number(carbs) !== goals.carbsG ||
      Number(fat) !== goals.fatG
    );
  }, [goals, calories, protein, carbs, fat]);

  const handleSave = async () => {
    const cal = Number(calories) || 0;
    const pro = Number(protein) || 0;
    const car = Number(carbs) || 0;
    const f = Number(fat) || 0;

    if (cal === 0 && pro === 0 && car === 0 && f === 0) return;

    setIsSaving(true);
    await save({ calories: cal, proteinG: pro, carbsG: car, fatG: f });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(false);
  };

  if (isLoading && !goals) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <ThemedText style={[Typography.largeTitle, { color: colors.text }]}>
              Daily Goals
            </ThemedText>
            <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
              Set your daily calorie and macro targets.
            </ThemedText>
          </View>

          <View style={styles.inputsContainer}>
            <MacroInput
              label="Calories"
              value={calories}
              onChangeText={setCalories}
              unit="kcal"
              accentColor={colors.caloriesAccent}
              colors={colors}
            />
            <MacroInput
              label="Protein"
              value={protein}
              onChangeText={setProtein}
              unit="g"
              accentColor={colors.proteinAccent}
              colors={colors}
            />
            <MacroInput
              label="Carbs"
              value={carbs}
              onChangeText={setCarbs}
              unit="g"
              accentColor={colors.carbsAccent}
              colors={colors}
            />
            <MacroInput
              label="Fat"
              value={fat}
              onChangeText={setFat}
              unit="g"
              accentColor={colors.fatAccent}
              colors={colors}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
              (!hasChanges() || isSaving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges() || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save Goals</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
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
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.xxxl,
  },
  inputsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xxxl,
  },
  inputCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inputLabel: {
    ...Typography.headline,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  input: {
    flex: 1,
    ...Typography.title2,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  unitText: {
    ...Typography.body,
    width: 36,
  },
  saveButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    ...Typography.headline,
    color: '#FFFFFF',
  },
});
