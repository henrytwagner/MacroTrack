import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import DateHeader from '@/components/DateHeader';
import MacroProgressBar from '@/components/MacroProgressBar';
import MacroRingProgress from '@/components/MacroRingProgress';
import MealGroup from '@/components/MealGroup';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useDateStore } from '@/stores/dateStore';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useGoalStore } from '@/stores/goalStore';
import type { FoodEntry, MealLabel } from '@shared/types';

const MEAL_ORDER: MealLabel[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MacroPreviewRow({
  label,
  current,
  goal,
  unit,
  colors,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  colors: Record<string, string>;
}) {
  const remaining = goal - current;
  const isOver = remaining < 0;
  const text =
    remaining >= 0
      ? `${Math.round(remaining)}${unit} left`
      : `${Math.round(Math.abs(remaining))}${unit} over`;
  return (
    <View style={styles.macroPreviewRow}>
      <ThemedText style={[Typography.caption2, { color: colors.textSecondary }]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption2,
          { color: isOver ? colors.progressOverflow : colors.textSecondary },
          styles.macroPreviewValue,
        ]}
      >
        {Math.round(current)} / {goal}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption2,
          { color: isOver ? colors.progressOverflow : colors.textTertiary },
        ]}
      >
        {text}
      </ThemedText>
    </View>
  );
}

export default function LogScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { width: pageWidth } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);

  const selectedDate = useDateStore((s) => s.selectedDate);
  const { goToPreviousDay, goToNextDay } = useDateStore();
  const {
    entries,
    entriesByMeal,
    totals,
    isLoading,
    error,
    fetch: fetchEntries,
    removeEntry,
    restoreEntry,
    commitDelete,
  } = useDailyLogStore();
  const { goals, fetch: fetchGoals } = useGoalStore();

  const [deletedEntry, setDeletedEntry] = useState<FoodEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [macroPreviewExpanded, setMacroPreviewExpanded] = useState(false);

  // Keep pager on center page when selectedDate changes (e.g. from header)
  useEffect(() => {
    pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [selectedDate, pageWidth]);

  useFocusEffect(
    useCallback(() => {
      fetchEntries(selectedDate);
      fetchGoals();
    }, [selectedDate, fetchEntries, fetchGoals]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEntries(selectedDate), fetchGoals()]);
    setRefreshing(false);
  }, [selectedDate, fetchEntries, fetchGoals]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.round(x / pageWidth);
      if (page === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        goToPreviousDay();
        const prevDate = addDays(selectedDate, -1);
        fetchEntries(prevDate);
        pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
      } else if (page === 2) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        goToNextDay();
        const nextDate = addDays(selectedDate, 1);
        fetchEntries(nextDate);
        pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
      }
    },
    [selectedDate, pageWidth, goToPreviousDay, goToNextDay, fetchEntries],
  );

  const handlePressEntry = (entry: FoodEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/edit-entry', params: { id: entry.id } });
  };

  const handleDeleteEntry = (entry: FoodEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const removed = removeEntry(entry.id);
    if (removed) {
      setDeletedEntry(removed);
    }
  };

  const handleUndo = () => {
    if (deletedEntry) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      restoreEntry(deletedEntry);
      setDeletedEntry(null);
    }
  };

  const handleUndoDismiss = () => {
    if (deletedEntry) {
      commitDelete(deletedEntry.id).catch(() => {});
      setDeletedEntry(null);
    }
  };

  const handleAddPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-food');
  };

  const handleMicPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({ pathname: '/kitchen-mode', params: { from: 'log' } });
  };

  const hasGoals = goals !== null;
  const hasEntries = entries.length > 0;
  const showMacroPreview = hasGoals && scrollY > 56;

  const prevDateLabel = (() => {
    const d = new Date(addDays(selectedDate, -1) + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })();
  const nextDateLabel = (() => {
    const d = new Date(addDays(selectedDate, 1) + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  const pageStyle = { width: pageWidth };

  const centerPage = (
    <ScrollView
      style={[styles.scrollView, pageStyle]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={32}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.tint}
        />
      }
    >
      {/* Macro Progress */}
      <View style={[styles.macroCard, { backgroundColor: colors.surface }]}>
        {hasGoals ? (
          <>
            <MacroProgressBar
              label="Calories"
              current={totals.calories}
              goal={goals!.calories}
              accentColor={colors.caloriesAccent}
              unit=" cal"
            />
            <MacroProgressBar
              label="Protein"
              current={totals.proteinG}
              goal={goals!.proteinG}
              accentColor={colors.proteinAccent}
              unit="g"
            />
            <MacroProgressBar
              label="Carbs"
              current={totals.carbsG}
              goal={goals!.carbsG}
              accentColor={colors.carbsAccent}
              unit="g"
            />
            <MacroProgressBar
              label="Fat"
              current={totals.fatG}
              goal={goals!.fatG}
              accentColor={colors.fatAccent}
              unit="g"
            />
          </>
        ) : (
          <View style={styles.noGoalsState}>
            <ThemedText
              style={[Typography.subhead, { color: colors.textSecondary, textAlign: 'center' }]}
            >
              Set your daily goals to track progress.
            </ThemedText>
          </View>
        )}
      </View>

      {/* Food Log */}
      {isLoading && !refreshing ? (
        <ActivityIndicator style={styles.loader} size="large" color={colors.tint} />
      ) : error ? (
        <View style={styles.emptyState}>
          <ThemedText
            style={[Typography.body, { color: colors.destructive, textAlign: 'center' }]}
          >
            Unable to connect to server. Check your connection.
          </ThemedText>
        </View>
      ) : !hasEntries ? (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={48} color={colors.textTertiary} />
          <ThemedText
            style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md }]}
          >
            No entries yet. Tap + to log food.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.mealGroups}>
          {MEAL_ORDER.map((meal) => (
            <MealGroup
              key={meal}
              meal={meal}
              entries={entriesByMeal[meal]}
              onPressEntry={handlePressEntry}
              onDeleteEntry={handleDeleteEntry}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <DateHeader showArrows={false} alignDate="left" />

      <View style={styles.pagerWrapper}>
        <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
      >
        {/* Left: previous day hint */}
        <View style={[styles.swipeHintPage, pageStyle, { backgroundColor: colors.background }]}>
          <Ionicons name="chevron-back" size={32} color={colors.textTertiary} />
          <ThemedText style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
            {prevDateLabel}
          </ThemedText>
          <ThemedText style={[Typography.footnote, { color: colors.textTertiary, marginTop: Spacing.xs }]}>
            Swipe for previous day
          </ThemedText>
        </View>
        {/* Center: current day log */}
        <View style={pageStyle}>{centerPage}</View>
        {/* Right: next day hint */}
        <View style={[styles.swipeHintPage, pageStyle, { backgroundColor: colors.background }]}>
          <Ionicons name="chevron-forward" size={32} color={colors.textTertiary} />
          <ThemedText style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
            {nextDateLabel}
          </ThemedText>
          <ThemedText style={[Typography.footnote, { color: colors.textTertiary, marginTop: Spacing.xs }]}>
            Swipe for next day
          </ThemedText>
        </View>
      </ScrollView>

        {/* Macro preview: absolutely positioned over scroll area */}
        {showMacroPreview && (
          <Pressable
            style={[
              styles.macroPreviewPill,
              {
                backgroundColor: colorScheme === 'dark'
                  ? 'rgba(28, 28, 30, 0.92)'
                  : 'rgba(255, 255, 255, 0.92)',
                borderColor: colors.border,
                shadowColor: '#000',
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMacroPreviewExpanded((e) => !e);
            }}
          >
            <MacroRingProgress
              totals={totals}
              goals={goals}
              variant="compact"
              showCalorieSummary={!macroPreviewExpanded}
            />
            {macroPreviewExpanded && goals && (
              <View style={[styles.macroPreviewDetails, { borderTopColor: colors.border }]}>
                <MacroPreviewRow
                  label="Cal"
                  current={totals.calories}
                  goal={goals.calories}
                  unit=""
                  colors={colors}
                />
                <MacroPreviewRow
                  label="P"
                  current={totals.proteinG}
                  goal={goals.proteinG}
                  unit="g"
                  colors={colors}
                />
                <MacroPreviewRow
                  label="C"
                  current={totals.carbsG}
                  goal={goals.carbsG}
                  unit="g"
                  colors={colors}
                />
                <MacroPreviewRow
                  label="F"
                  current={totals.fatG}
                  goal={goals.fatG}
                  unit="g"
                  colors={colors}
                />
              </View>
            )}
          </Pressable>
        )}
      </View>

      {/* Bottom right: mic (small, white, blue) above add (main FAB) */}
      <View style={styles.fabStack}>
        <Pressable
          style={({ pressed }) => [
            styles.micFabSmall,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
          ]}
          onPress={handleMicPress}
        >
          <Ionicons name="mic" size={22} color={colors.tint} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.addFab,
            { backgroundColor: colors.tint },
            pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
          ]}
          onPress={handleAddPress}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </View>

      <UndoSnackbar
        message={deletedEntry ? `${deletedEntry.name} deleted.` : ''}
        visible={!!deletedEntry}
        onUndo={handleUndo}
        onDismiss={handleUndoDismiss}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pagerWrapper: {
    flex: 1,
    position: 'relative',
  },
  pager: {
    flex: 1,
  },
  pagerContent: {},
  swipeHintPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 120,
    gap: Spacing.lg,
  },
  macroCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  noGoalsState: {
    paddingVertical: Spacing.xxl,
  },
  loader: {
    marginTop: Spacing.xxxl,
  },
  emptyState: {
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  mealGroups: {
    gap: Spacing.xl,
  },
  macroPreviewPill: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 10,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  macroPreviewDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  macroPreviewRow: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  macroPreviewValue: {
    fontWeight: '600',
  },
  fabStack: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    alignItems: 'center',
    gap: 12,
  },
  micFabSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  addFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
