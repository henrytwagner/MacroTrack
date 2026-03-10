import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DashboardMacroSingleLayout } from '@/components/DashboardMacroLayouts';
import { useDashboardLayoutStore } from '@/stores/dashboardLayoutStore';
import FrequentFoodRow from '@/components/FrequentFoodRow';
import MacroInlineLine from '@/components/MacroInlineLine';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useGoalStore } from '@/stores/goalStore';
import { todayString } from '@/stores/dateStore';
import type { FrequentFood, RecentFood, MealLabel } from '@shared/types';
import * as api from '@/services/api';

const MEAL_ORDER: MealLabel[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getMealLabel(): MealLabel {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

function formatTodayFull(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const today = todayString();

  const {
    entries,
    totals,
    isLoading,
    error,
    fetch: fetchEntries,
  } = useDailyLogStore();
  const { goals, fetch: fetchGoals } = useGoalStore();
  const { layoutId } = useDashboardLayoutStore();

  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchEntries(today), fetchGoals()]);
  }, [today, fetchEntries, fetchGoals]);

  const fetchFrequent = useCallback(async () => {
    try {
      const freq = await api.getFrequentFoods();
      setFrequentFoods(freq.slice(0, 3));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    fetchFrequent();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEntries(today);
      fetchFrequent();
    }, [today, fetchEntries, fetchFrequent]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchAll(), fetchFrequent()]);
    setRefreshing(false);
  }, [fetchAll, fetchFrequent]);

  const handleQuickAdd = useCallback(
    async (food: FrequentFood | RecentFood) => {
      const isFrequent = 'logCount' in food;
      const qty = isFrequent
        ? (food as FrequentFood).lastQuantity
        : (food as RecentFood).quantity;
      const unit = isFrequent
        ? (food as FrequentFood).lastUnit
        : (food as RecentFood).unit;

      try {
        await api.createEntry({
          date: today,
          name: food.name,
          calories: food.macros.calories,
          proteinG: food.macros.proteinG,
          carbsG: food.macros.carbsG,
          fatG: food.macros.fatG,
          quantity: qty,
          unit,
          source: food.source,
          mealLabel: getMealLabel(),
          usdaFdcId: food.usdaFdcId,
          customFoodId: food.customFoodId,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        fetchEntries(today);
        fetchFrequent();
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [today, fetchEntries, fetchFrequent],
  );

  const hasGoals = goals !== null;
  const recentEntries = [...entries]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.tint}
          />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <ThemedText style={[Typography.largeTitle, { color: colors.text }]}>
            {getGreeting()}
          </ThemedText>
          <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
            {formatTodayFull()}
          </ThemedText>
        </View>

        {/* Macro Progress — single layout (selector on Edit dashboard) */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ThemedText style={[Typography.headline, { color: colors.text, marginBottom: Spacing.md }]}>
            Today's Progress
          </ThemedText>
          {hasGoals ? (
            <View style={styles.progressLayoutWrap}>
              <DashboardMacroSingleLayout layoutId={layoutId} totals={totals} goals={goals} />
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <ThemedText
                style={[Typography.subhead, { color: colors.tint, textAlign: 'center', paddingVertical: Spacing.lg }]}
              >
                Set your daily goals to track progress →
              </ThemedText>
            </Pressable>
          )}
        </View>

        {/* Quick Add */}
        {frequentFoods.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={[Typography.headline, { color: colors.text }]}>
                Quick Add
              </ThemedText>
              <Pressable
                onPress={() => router.push('/add-food')}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <ThemedText style={[Typography.subhead, { color: colors.tint }]}>
                  Search foods
                </ThemedText>
              </Pressable>
            </View>
            <View style={[styles.listCard, { backgroundColor: colors.surface }]}>
              {frequentFoods.map((food, i) => (
                <View key={`freq-${food.name}-${i}`}>
                  {i > 0 && (
                    <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
                  )}
                  <FrequentFoodRow
                    food={food}
                    onPressName={() => router.push('/add-food')}
                    onQuickAdd={handleQuickAdd}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Today's Log Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={[Typography.headline, { color: colors.text }]}>
              Today's Log
            </ThemedText>
            <Pressable
              onPress={() => router.push('/(tabs)/log')}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <ThemedText style={[Typography.subhead, { color: colors.tint }]}>
                See all
              </ThemedText>
            </Pressable>
          </View>

          {isLoading && !refreshing ? (
            <ActivityIndicator style={styles.loader} size="small" color={colors.tint} />
          ) : error ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <ThemedText style={[Typography.subhead, { color: colors.destructive, textAlign: 'center' }]}>
                Unable to connect. Pull to refresh.
              </ThemedText>
            </View>
          ) : recentEntries.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={styles.emptyState}>
                <Ionicons name="nutrition-outline" size={32} color={colors.textTertiary} />
                <ThemedText style={[Typography.subhead, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Nothing logged yet today.
                </ThemedText>
                <Pressable
                  onPress={() => router.push('/add-food')}
                  style={({ pressed }) => [
                    styles.logButton,
                    { backgroundColor: colors.tint },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <ThemedText style={[Typography.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>
                    Log Food
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: colors.surface }]}>
              {recentEntries.map((entry, i) => (
                <View key={entry.id}>
                  {i > 0 && (
                    <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
                  )}
                  <View style={styles.entryRow}>
                    <View style={styles.entryInfo}>
                      <ThemedText
                        style={[Typography.body, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {entry.name}
                      </ThemedText>
                      <MacroInlineLine
                        prefix={`${entry.quantity} ${entry.unit}`}
                        macros={entry}
                        colors={{
                          ...colors,
                          textSecondary: colors.textSecondary,
                        }}
                        textStyle="caption1"
                      />
                    </View>
                    <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
                      {MEAL_ORDER.includes(entry.mealLabel) ? entry.mealLabel.charAt(0).toUpperCase() + entry.mealLabel.slice(1) : entry.mealLabel}
                    </ThemedText>
                  </View>
                </View>
              ))}
              {entries.length > 3 && (
                <Pressable
                  style={[styles.seeMoreRow, { borderTopColor: colors.borderLight }]}
                  onPress={() => router.push('/(tabs)/log')}
                >
                  <ThemedText style={[Typography.footnote, { color: colors.tint }]}>
                    +{entries.length - 3} more entries
                  </ThemedText>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Edit dashboard link — bottom of dashboard */}
        <Pressable
          onPress={() => router.push('/edit-dashboard')}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <ThemedText
            style={[Typography.subhead, { color: colors.tint, textAlign: 'center' }]}
          >
            Edit dashboard
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
    gap: Spacing.xl,
  },
  greetingSection: {
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  progressLayoutWrap: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  section: {
    gap: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
  },
  listCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  entryInfo: {
    flex: 1,
    gap: 4,
  },
  seeMoreRow: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
