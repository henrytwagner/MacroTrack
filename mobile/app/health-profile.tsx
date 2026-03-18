import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProfileStore } from '@/stores/profileStore';
import type { ActivityLevel, Sex } from '@shared/types';

const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  SEDENTARY: 'Little or no exercise; mostly sitting (e.g., desk job, <5k steps/day).',
  LIGHT: 'Light exercise 1–3 days/week or on your feet some of the day (~5–7k steps/day).',
  MODERATE:
    'Moderate exercise 3–5 days/week or active job (e.g., walking a lot, ~7–10k+ steps/day).',
  HIGH: 'Hard exercise most days or very active job (e.g., retail, restaurant, ~10–14k steps/day).',
  VERY_HIGH:
    'Intense training or physically demanding work every day (e.g., manual labor, >14k steps/day).',
};

function formatDateOfBirth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateOfBirth(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export default function HealthProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { profile, isLoading, fetch, save } = useProfileStore();

  const [heightInput, setHeightInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [sex, setSex] = useState<Sex>('UNSPECIFIED');
  const [activity, setActivity] = useState<ActivityLevel | undefined>(undefined);

  const unitSystem = profile?.preferredUnits ?? 'METRIC';

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!profile) return;
    setSex(profile.sex);
    setActivity(profile.activityLevel);
    if (profile.dateOfBirth) {
      setDateOfBirth(parseDateOfBirth(profile.dateOfBirth));
    } else {
      setDateOfBirth(null);
    }
    if (profile.heightCm != null) {
      const h =
        profile.preferredUnits === 'IMPERIAL'
          ? profile.heightCm / 2.54
          : profile.heightCm;
      setHeightInput(h.toFixed(0));
    }
    if (profile.weightKg != null) {
      const w =
        profile.preferredUnits === 'IMPERIAL'
          ? profile.weightKg / 0.45359237
          : profile.weightKg;
      setWeightInput(w.toFixed(0));
    }
  }, [profile]);

  const handleSave = async () => {
    const rawHeight = heightInput ? Number(heightInput) : undefined;
    const rawWeight = weightInput ? Number(weightInput) : undefined;

    let heightCm: number | undefined;
    let weightKg: number | undefined;

    if (rawHeight && Number.isFinite(rawHeight)) {
      heightCm = unitSystem === 'IMPERIAL' ? rawHeight * 2.54 : rawHeight;
    }
    if (rawWeight && Number.isFinite(rawWeight)) {
      weightKg = unitSystem === 'IMPERIAL' ? rawWeight * 0.45359237 : rawWeight;
    }

    await save({
      heightCm,
      weightKg,
      dateOfBirth: dateOfBirth ? formatDateOfBirth(dateOfBirth) : undefined,
      sex,
      activityLevel: activity,
      preferredUnits: unitSystem,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const disabled = isLoading || !heightInput || !weightInput || !activity;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
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
          Health Profile
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
          <View style={styles.header}>
            <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
              We use this info to suggest starting calorie and macro targets.
            </ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.row}>
              <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
                Height ({unitSystem === 'IMPERIAL' ? 'in' : 'cm'})
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border },
                ]}
                value={heightInput}
                onChangeText={setHeightInput}
                keyboardType="numeric"
                placeholder={unitSystem === 'IMPERIAL' ? '70' : '178'}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
            <View style={styles.row}>
              <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
                Weight ({unitSystem === 'IMPERIAL' ? 'lb' : 'kg'})
              </ThemedText>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border },
                ]}
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="numeric"
                placeholder={unitSystem === 'IMPERIAL' ? '180' : '82'}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
            <View style={styles.row}>
              <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
                Date of birth
              </ThemedText>
              <Pressable
                onPress={() => setShowDobPicker(true)}
                style={[
                  styles.input,
                  styles.dobTouchable,
                  { borderColor: colors.border },
                ]}
              >
                <ThemedText
                  style={[
                    Typography.body,
                    { color: dateOfBirth ? colors.text : colors.textTertiary },
                  ]}
                >
                  {dateOfBirth
                    ? dateOfBirth.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Select date'}
                </ThemedText>
              </Pressable>
            </View>
            {showDobPicker && (
              <DateTimePicker
                value={dateOfBirth ?? new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                onChange={(_, selected) => {
                  if (Platform.OS === 'android') setShowDobPicker(false);
                  if (selected) setDateOfBirth(selected);
                }}
                onTouchCancel={() => setShowDobPicker(false)}
              />
            )}
            {Platform.OS === 'ios' && showDobPicker && (
              <Pressable
                style={styles.doneDob}
                onPress={() => setShowDobPicker(false)}
              >
                <ThemedText style={[Typography.headline, { color: colors.tint }]}>
                  Done
                </ThemedText>
              </Pressable>
            )}
            <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
            <View style={styles.row}>
              <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
                Sex
              </ThemedText>
              <View style={styles.pillRow}>
                {[
                  { label: 'Male', value: 'MALE' as Sex },
                  { label: 'Female', value: 'FEMALE' as Sex },
                  { label: 'Other', value: 'UNSPECIFIED' as Sex },
                ].map((opt) => {
                  const selected = sex === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: selected
                            ? colors.tint
                            : colors.surfaceSecondary,
                          borderColor: selected ? colors.tint : colors.border,
                        },
                      ]}
                      onPress={() => setSex(opt.value)}
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
            <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
            <View
              style={[
                styles.row,
                { flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.sm },
              ]}
            >
              <ThemedText style={[Typography.body, { color: colors.text }]}>
                Activity level
              </ThemedText>
              <View style={styles.pillRow}>
                {[
                  { label: 'Sedentary', value: 'SEDENTARY' as ActivityLevel },
                  { label: 'Light', value: 'LIGHT' as ActivityLevel },
                  { label: 'Moderate', value: 'MODERATE' as ActivityLevel },
                  { label: 'High', value: 'HIGH' as ActivityLevel },
                  { label: 'Very high', value: 'VERY_HIGH' as ActivityLevel },
                ].map((opt) => {
                  const selected = activity === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: selected
                            ? colors.tint
                            : colors.surfaceSecondary,
                          borderColor: selected ? colors.tint : colors.border,
                        },
                      ]}
                      onPress={() => setActivity(opt.value)}
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
              {activity && (
                <ThemedText
                  style={[
                    Typography.footnote,
                    { color: colors.textSecondary, marginTop: Spacing.xs },
                  ]}
                >
                  {ACTIVITY_DESCRIPTIONS[activity]}
                </ThemedText>
              )}
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: colors.tint,
                opacity: pressed || disabled ? 0.6 : 1,
              },
            ]}
            disabled={disabled}
            onPress={handleSave}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <ThemedText style={[Typography.headline, { color: '#FFFFFF' }]}>
                Save
              </ThemedText>
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
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
    gap: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  input: {
    minWidth: 80,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    textAlign: 'right',
    ...Typography.body,
  },
  dobTouchable: {
    minWidth: 120,
    justifyContent: 'center',
  },
  doneDob: {
    paddingVertical: Spacing.sm,
    alignItems: 'flex-end',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  pill: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 1.2,
  },
  saveButton: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
});

