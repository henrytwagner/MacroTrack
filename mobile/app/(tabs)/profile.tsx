import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useAppearanceStore,
  type AppearanceMode,
} from '@/stores/appearanceStore';
import { useEffect, useState } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import type { UnitSystem } from '@shared/types';

const APPEARANCE_OPTIONS: { label: string; value: AppearanceMode; icon: string }[] = [
  { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  { label: 'Light', value: 'light', icon: 'sunny-outline' },
  { label: 'Dark', value: 'dark', icon: 'moon-outline' },
];

interface SettingsRowProps {
  icon: string;
  label: string;
  onPress: () => void;
  colors: (typeof Colors)['light'];
  subtitle?: string;
}

function SettingsRow({ icon, label, subtitle, onPress, colors }: SettingsRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingsRow,
        { backgroundColor: colors.surface },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.rowIconContainer, { backgroundColor: colors.tint + '18' }]}>
        <Ionicons name={icon as any} size={20} color={colors.tint} />
      </View>
      <View style={styles.rowContent}>
        <ThemedText style={[Typography.body, { color: colors.text }]}>
          {label}
        </ThemedText>
        {subtitle && (
          <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { appearance, setAppearance } = useAppearanceStore();
  const { profile, fetch, save } = useProfileStore();

  const [unitSystem, setUnitSystem] = useState<UnitSystem>('METRIC');

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!profile) return;
    setUnitSystem(profile.preferredUnits);
  }, [profile]);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.version ?? '1.0.0';
  const buildNumber =
    (Constants.expoConfig as any)?.ios?.buildNumber ??
    (Constants.expoConfig as any)?.android?.versionCode ??
    'dev';

  const handleUnitsChange = (next: UnitSystem) => {
    setUnitSystem(next);
    void save({
      preferredUnits: next,
      sex: profile?.sex ?? 'UNSPECIFIED',
    });
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title */}
        <View style={styles.pageTitle}>
          <ThemedText style={[Typography.largeTitle, { color: colors.text }]}>
            Profile
          </ThemedText>
        </View>

        {/* Profile summary */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.tint + '22' }]}>
            <Ionicons name="person" size={36} color={colors.tint} />
          </View>
          <View style={styles.profileInfo}>
            <ThemedText style={[Typography.title3, { color: colors.text }]}>
              My Profile
            </ThemedText>
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
              Health details and goals live in dedicated screens.
            </ThemedText>
          </View>
        </View>

        {/* Profile & nutrition shortcuts */}
        <View style={styles.sectionGroup}>
          <ThemedText
            style={[styles.sectionLabel, Typography.footnote, { color: colors.textSecondary }]}
          >
            PROFILE
          </ThemedText>
          <View style={[styles.groupCard, { backgroundColor: colors.surface }]}>
            <SettingsRow
              icon="person-circle-outline"
              label="Health profile"
              subtitle="Gender, height, weight, age, activity"
              onPress={() => router.push('/health-profile')}
              colors={colors}
            />
          </View>
        </View>

        {/* Nutrition */}
        <View style={styles.sectionGroup}>
          <ThemedText style={[styles.sectionLabel, Typography.footnote, { color: colors.textSecondary }]}>
            NUTRITION
          </ThemedText>
          <View style={[styles.groupCard, { backgroundColor: colors.surface }]}>
            <SettingsRow
              icon="flag-outline"
              label="Daily Goals"
              subtitle="Calories, protein, carbs, fat"
              onPress={() => router.push('/goals')}
              colors={colors}
            />
            <View style={[styles.rowSeparator, { backgroundColor: colors.borderLight }]} />
            <SettingsRow
              icon="restaurant-outline"
              label="My Foods"
              subtitle="Manage custom foods"
              onPress={() => router.push('/add-food')}
              colors={colors}
            />
            <View style={[styles.rowSeparator, { backgroundColor: colors.borderLight }]} />
            <SettingsRow
              icon="barcode-outline"
              label="Barcode demo"
              subtitle="Scan or enter barcode to look up product"
              onPress={() => router.push('/barcode-demo')}
              colors={colors}
            />
            <View style={[styles.rowSeparator, { backgroundColor: colors.borderLight }]} />
            <SettingsRow
              icon="scale-outline"
              label="Scale demo"
              subtitle="Connect to Etekcity ESN00 smart scale"
              onPress={() => router.push('/scale-demo')}
              colors={colors}
            />
          </View>
        </View>

        {/* Appearance */}
        <View style={styles.sectionGroup}>
          <ThemedText style={[styles.sectionLabel, Typography.footnote, { color: colors.textSecondary }]}>
            APPEARANCE
          </ThemedText>
          <View style={[styles.groupCard, { backgroundColor: colors.surface }]}>
            <View style={styles.appearanceRow}>
              <View style={[styles.rowIconContainer, { backgroundColor: colors.tint + '18' }]}>
                <Ionicons name="color-palette-outline" size={20} color={colors.tint} />
              </View>
              <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
                Theme
              </ThemedText>
              <View style={styles.appearancePills}>
                {APPEARANCE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.pill,
                      {
                        backgroundColor:
                          appearance === opt.value ? colors.tint : colors.surfaceSecondary,
                        borderColor:
                          appearance === opt.value ? colors.tint : colors.border,
                      },
                    ]}
                    onPress={() => setAppearance(opt.value)}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={14}
                      color={appearance === opt.value ? '#FFFFFF' : colors.textSecondary}
                    />
                    <ThemedText
                      style={[
                        Typography.caption1,
                        {
                          color: appearance === opt.value ? '#FFFFFF' : colors.textSecondary,
                          fontWeight: appearance === opt.value ? '600' : '400',
                        },
                      ]}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={[styles.rowSeparator, { backgroundColor: colors.borderLight }]} />
            <View style={styles.appearanceRow}>
              <View style={[styles.rowIconContainer, { backgroundColor: colors.tint + '18' }]}>
                <Ionicons name="stats-chart-outline" size={20} color={colors.tint} />
              </View>
              <ThemedText style={[Typography.body, { color: colors.text, flex: 1 }]}>
                Units
              </ThemedText>
              <View style={styles.appearancePills}>
                {[
                  { label: 'Metric', value: 'METRIC' as UnitSystem },
                  { label: 'Imperial', value: 'IMPERIAL' as UnitSystem },
                ].map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.pill,
                      {
                        backgroundColor:
                          unitSystem === opt.value ? colors.tint : colors.surfaceSecondary,
                        borderColor:
                          unitSystem === opt.value ? colors.tint : colors.border,
                      },
                    ]}
                    onPress={() => handleUnitsChange(opt.value)}
                  >
                    <ThemedText
                      style={[
                        Typography.caption1,
                        {
                          color:
                            unitSystem === opt.value ? '#FFFFFF' : colors.textSecondary,
                          fontWeight: unitSystem === opt.value ? '600' : '400',
                        },
                      ]}
                    >
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Development */}
        <View style={styles.sectionGroup}>
          <ThemedText style={[styles.sectionLabel, Typography.footnote, { color: colors.textSecondary }]}>
            DEVELOPMENT
          </ThemedText>
          <View style={[styles.groupCard, { backgroundColor: colors.surface }]}>
            <SettingsRow
              icon="bug-outline"
              label="Custom Foods"
              subtitle="Edit and delete custom foods"
              onPress={() => router.push('/manage-custom-foods')}
              colors={colors}
            />
            <View style={[styles.rowSeparator, { backgroundColor: colors.borderLight }]} />
            <SettingsRow
              icon="globe-outline"
              label="Community Foods"
              subtitle="Edit and delete community foods"
              onPress={() => router.push('/manage-community-foods')}
              colors={colors}
            />
          </View>
        </View>

        {/* App info placeholder */}
        <View style={styles.sectionGroup}>
          <ThemedText style={[styles.sectionLabel, Typography.footnote, { color: colors.textSecondary }]}>
            ABOUT
          </ThemedText>
          <View style={[styles.groupCard, { backgroundColor: colors.surface }]}>
            <View style={styles.infoRow}>
              <ThemedText style={[Typography.body, { color: colors.text }]}>
                MacroTrack
              </ThemedText>
              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText style={[Typography.body, { color: colors.textSecondary }]}>
                  v{appVersion}
                </ThemedText>
                <ThemedText
                  style={[
                    Typography.caption1,
                    { color: colors.textTertiary, marginTop: 2 },
                  ]}
                >
                  Build {buildNumber}
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
    gap: Spacing.xl,
  },
  pageTitle: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionGroup: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.xs,
  },
  groupCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  profileInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  profileTextInput: {
    minWidth: 72,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    textAlign: 'right',
    ...Typography.body,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  smallPill: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 1.2,
  },
  profileSaveButton: {
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  rowIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  appearanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  appearancePills: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
