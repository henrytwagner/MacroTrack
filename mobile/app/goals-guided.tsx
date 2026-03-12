import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { GoalEditForm, type GoalEditFormValues } from '@/components/GoalEditForm';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfileStore } from '@/stores/profileStore';
import { useGoalStore } from '@/stores/goalStore';
import { useDateStore } from '@/stores/dateStore';
import { ageFromDateOfBirth } from '@/utils/age';
import type {
  ActivityLevel,
  GoalAggressiveness,
  GoalType,
  Macros,
  UserProfile,
} from '@shared/types';

function parsePositiveNumber(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function estimateMacros(
  profile: UserProfile,
  goalType: GoalType,
  aggressiveness: GoalAggressiveness,
): Macros | null {
  const weightKg = profile.weightKg;
  const heightCm = profile.heightCm;
  const sex = profile.sex;
  const activityLevel = profile.activityLevel;

  if (!weightKg || !heightCm || !activityLevel) {
    return null;
  }

  const age = profile.ageYears ?? ageFromDateOfBirth(profile.dateOfBirth) ?? 30;

  // Step 2 – BMR (Mifflin–St Jeor)
  let bmr: number;
  if (sex === 'FEMALE') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }

  // Step 3 – TDEE via activity multiplier
  const activityFactorByLevel: Record<ActivityLevel, number> = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    HIGH: 1.725,
    VERY_HIGH: 1.9,
  };

  const activityFactor = activityFactorByLevel[activityLevel];
  const tdee = bmr * activityFactor;

  // Step 4 – Goal calories by goal type + aggressiveness
  let multiplier = 1;
  if (goalType === 'CUT') {
    if (aggressiveness === 'MILD') multiplier = 0.9;
    else if (aggressiveness === 'STANDARD') multiplier = 0.85;
    else multiplier = 0.8;
  } else if (goalType === 'MAINTAIN') {
    multiplier = 1;
  } else if (goalType === 'GAIN') {
    if (aggressiveness === 'MILD') multiplier = 1.05;
    else if (aggressiveness === 'STANDARD') multiplier = 1.1;
    else multiplier = 1.15;
  }

  const targetCalories = Math.round((tdee * multiplier) / 10) * 10;

  // Step 5 – Macro grams from calories and body weight
  let proteinPerKg: number;
  if (goalType === 'CUT') proteinPerKg = 2.2;
  else if (goalType === 'GAIN') proteinPerKg = 1.8;
  else proteinPerKg = 1.8;

  const proteinG = proteinPerKg * weightKg;

  let fatPerKg = 0.8;
  const minFatCalories = 0.2 * targetCalories;
  let fatG = fatPerKg * weightKg;
  if (fatG * 9 < minFatCalories) {
    fatG = minFatCalories / 9;
  }

  const proteinCals = proteinG * 4;
  const fatCals = fatG * 9;
  const carbCals = Math.max(0, targetCalories - proteinCals - fatCals);
  const carbsG = carbCals / 4;

  return {
    calories: targetCalories,
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
  };
}

type WizardStep = 0 | 1 | 2;

export default function GuidedGoalsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { selectedDate } = useDateStore();
  const { profile, fetch: fetchProfile } = useProfileStore();
  const { saveChange } = useGoalStore();

  const [step, setStep] = useState<WizardStep>(0);
  const [goalType, setGoalType] = useState<GoalType>('CUT');
  const [aggressiveness, setAggressiveness] =
    useState<GoalAggressiveness>('STANDARD');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    if (!profile) {
      setIsLoadingProfile(true);
      void fetchProfile().finally(() => setIsLoadingProfile(false));
    }
  }, [profile, fetchProfile]);

  const canCompute = useMemo(() => {
    if (!profile) return false;
    return !!(profile.heightCm && profile.weightKg && profile.activityLevel);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const estimated = estimateMacros(profile, goalType, aggressiveness);
    if (estimated) {
      setCalories(String(estimated.calories));
      setProtein(String(Math.round(estimated.proteinG)));
      setCarbs(String(Math.round(estimated.carbsG)));
      setFat(String(Math.round(estimated.fatG)));
    }
  }, [profile, goalType, aggressiveness]);

  const nextDisabled = useMemo(() => {
    if (step === 0) return !profile;
    if (step === 1) return false;
    return false;
  }, [step, profile]);

  const handleSave = useCallback(async () => {
    const cal = parsePositiveNumber(calories);
    const pro = parsePositiveNumber(protein);
    const car = parsePositiveNumber(carbs);
    const f = parsePositiveNumber(fat);
    if (!cal || !pro || !car || !f) return;

    setIsSaving(true);
    await saveChange({
      effectiveDate: selectedDate,
      macros: { calories: cal, proteinG: pro, carbsG: car, fatG: f },
      goalType,
      aggressiveness,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(false);
    router.back();
  }, [calories, protein, carbs, fat, selectedDate, goalType, aggressiveness, saveChange, router]);

  const renderStep = () => {
    if (step === 0) {
      return (
          <View style={styles.stepSection}>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>
            Check your profile
          </ThemedText>
          <ThemedText style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
            We use your height, weight, sex, age (if set), and activity level to estimate a starting point.
          </ThemedText>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {isLoadingProfile && !profile ? (
              <ActivityIndicator color={colors.tint} />
            ) : profile ? (
              (() => {
                const unitSystem = profile.preferredUnits ?? 'METRIC';
                const heightText = profile.heightCm
                  ? unitSystem === 'IMPERIAL'
                    ? `${Math.round(profile.heightCm / 2.54)} in`
                    : `${Math.round(profile.heightCm)} cm`
                  : 'Not set';
                const weightText = profile.weightKg
                  ? unitSystem === 'IMPERIAL'
                    ? `${Math.round(profile.weightKg / 0.45359237)} lb`
                    : `${Math.round(profile.weightKg)} kg`
                  : 'Not set';
                const derivedAge = profile.ageYears ?? ageFromDateOfBirth(profile.dateOfBirth);
                const ageText = derivedAge != null ? String(derivedAge) : 'Not set';

                return (
                  <>
                    <ThemedText style={[Typography.subhead, { color: colors.text }]}>
                      Your current stats
                    </ThemedText>
                    <ThemedText style={[Typography.footnote, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
                      Height: {heightText}
                    </ThemedText>
                    <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
                      Weight: {weightText}
                    </ThemedText>
                    <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
                      Age: {ageText}
                    </ThemedText>
                    <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
                      Activity: {profile.activityLevel ?? 'Not set'}
                    </ThemedText>
                  </>
                );
              })()
            ) : (
              <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
                No profile yet. Add height, weight, and activity level on the Profile tab for better suggestions.
              </ThemedText>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.subtleLinkButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => router.push('/health-profile')}
            >
              <ThemedText
                style={[
                  Typography.footnote,
                  { color: colors.tint, textAlign: 'center' },
                ]}
              >
                Edit health details
              </ThemedText>
            </Pressable>
          </View>
          {!canCompute && (
            <ThemedText style={[Typography.footnote, { color: colors.warning, marginTop: Spacing.sm }]}>
              Suggestions work best when height, weight, and activity are set. You can still continue and enter targets manually.
            </ThemedText>
          )}
        </View>
      );
    }

    if (step === 1) {
      return (
        <View style={styles.stepSection}>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>
            Choose your goal
          </ThemedText>
          <ThemedText style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
            Pick what you’re aiming for right now.
          </ThemedText>
          <View style={styles.choiceRow}>
            {[
              { label: 'Lose fat', value: 'CUT' as GoalType, desc: 'Calorie deficit for fat loss' },
              { label: 'Maintain', value: 'MAINTAIN' as GoalType, desc: 'Stay around current weight' },
              { label: 'Gain muscle', value: 'GAIN' as GoalType, desc: 'Small surplus for lean gains' },
            ].map((opt) => {
              const selected = goalType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.choiceCard,
                    {
                      borderColor: selected ? colors.tint : colors.borderLight,
                      backgroundColor: selected ? colors.tint + '15' : colors.surface,
                    },
                  ]}
                  onPress={() => setGoalType(opt.value)}
                >
                  <ThemedText
                    style={[
                      Typography.subhead,
                      { color: selected ? colors.tint : colors.text },
                    ]}
                  >
                    {opt.label}
                  </ThemedText>
                  <ThemedText
                    style={[
                      Typography.footnote,
                      { color: colors.textSecondary, marginTop: 2 },
                    ]}
                  >
                    {opt.desc}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: Spacing.lg }}>
            <ThemedText style={[Typography.subhead, { color: colors.text }]}>
              Aggressiveness
            </ThemedText>
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
              Rough weekly rate estimates assume average training and adherence.
            </ThemedText>
            <View style={styles.pillRow}>
              {[
                {
                  label:
                    goalType === 'GAIN'
                      ? 'Mild (+0.25 lb/wk)'
                      : goalType === 'MAINTAIN'
                        ? 'Tight range'
                        : 'Mild (~0.5 lb/wk)',
                  value: 'MILD' as GoalAggressiveness,
                },
                {
                  label:
                    goalType === 'GAIN'
                      ? 'Standard (+0.5 lb/wk)'
                      : goalType === 'MAINTAIN'
                        ? 'Maintenance'
                        : 'Standard (~0.75 lb/wk)',
                  value: 'STANDARD' as GoalAggressiveness,
                },
                {
                  label:
                    goalType === 'GAIN'
                      ? 'Aggressive (+0.75 lb/wk)'
                      : goalType === 'MAINTAIN'
                        ? 'Loose range'
                        : 'Aggressive (~1 lb/wk)',
                  value: 'AGGRESSIVE' as GoalAggressiveness,
                },
              ].map((opt) => {
                const selected = aggressiveness === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.smallPill,
                      {
                        backgroundColor: selected ? colors.tint : colors.surfaceSecondary,
                        borderColor: selected ? colors.tint : colors.border,
                      },
                    ]}
                    onPress={() => setAggressiveness(opt.value)}
                  >
                    <ThemedText
                      style={[
                        Typography.caption1,
                        {
                          color: selected ? '#FFFFFF' : colors.textSecondary,
                          fontWeight: selected ? '600' : '400',
                        },
                      ]}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stepSection}>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>
          Review & adjust targets
        </ThemedText>
        <ThemedText style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
          Suggestions based on your stats and goal. Tweak any value, then save.
        </ThemedText>
        <View style={{ marginTop: Spacing.lg }}>
          <GoalEditForm
            values={{ calories, protein, carbs, fat }}
            onChange={(v) => {
              setCalories(v.calories);
              setProtein(v.protein);
              setCarbs(v.carbs);
              setFat(v.fat);
            }}
            colors={colors}
          />
        </View>
      </View>
    );
  };

  const canSave =
    parsePositiveNumber(calories) !== null &&
    parsePositiveNumber(protein) !== null &&
    parsePositiveNumber(carbs) !== null &&
    parsePositiveNumber(fat) !== null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.navHeader, { borderBottomColor: colors.borderLight }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={26} color={colors.tint} />
        </Pressable>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>
          Guided Goals
        </ThemedText>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          { borderTopColor: colors.borderLight, backgroundColor: colors.background },
        ]}
      >
        <View style={styles.stepDots}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.stepDot,
                {
                  backgroundColor:
                    i === step ? colors.tint : colors.textTertiary,
                  opacity: i === step ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.footerButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              { opacity: step === 0 || pressed ? 0.7 : 1 },
            ]}
            disabled={step === 0}
            onPress={() => setStep((prev) => (prev > 0 ? ((prev - 1) as WizardStep) : prev))}
          >
            <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
              Back
            </ThemedText>
          </Pressable>
          {step < 2 ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.tint,
                  opacity: pressed || nextDisabled ? 0.5 : 1,
                },
              ]}
              disabled={nextDisabled}
              onPress={() => setStep((prev) => (prev < 2 ? ((prev + 1) as WizardStep) : prev))}
            >
              <ThemedText style={[Typography.subhead, { color: '#FFFFFF' }]}>
                Next
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.tint,
                  opacity: pressed || !canSave || isSaving ? 0.5 : 1,
                },
              ]}
              disabled={!canSave || isSaving}
              onPress={handleSave}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText style={[Typography.subhead, { color: '#FFFFFF' }]}>
                  Save goals
                </ThemedText>
              )}
            </Pressable>
          )}
        </View>
      </View>
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
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
    gap: Spacing.lg,
  },
  stepSection: {
    gap: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  subtleLinkButton: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceRow: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  choiceCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  smallPill: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 1.2,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

