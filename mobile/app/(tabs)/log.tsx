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
import MealGroup from '@/components/MealGroup';
import EditEntrySheet from '@/components/EditEntrySheet';
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

  const [editEntry, setEditEntry] = useState<FoodEntry | null>(null);
  const [deletedEntry, setDeletedEntry] = useState<FoodEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    setEditEntry(entry);
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

  const handleEditSaved = () => {
    setEditEntry(null);
    fetchEntries(selectedDate);
  };

  const handleEditDeleted = () => {
    setEditEntry(null);
    fetchEntries(selectedDate);
  };

  const handleAddPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-food');
  };

  const handleMicPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/kitchen-mode');
  };

  const hasGoals = goals !== null;
  const hasEntries = entries.length > 0;

  const addButton = (
    <Pressable
      onPress={handleAddPress}
      hitSlop={12}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="add-circle" size={28} color={colors.tint} />
    </Pressable>
  );

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
      <DateHeader rightAction={addButton} />

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

      {/* Mic FAB — bottom right */}
      <Pressable
        style={({ pressed }) => [
          styles.micFab,
          { backgroundColor: colors.tint },
          pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
        ]}
        onPress={handleMicPress}
      >
        <Ionicons name="mic" size={28} color="#FFFFFF" />
      </Pressable>

      {editEntry && (
        <EditEntrySheet
          entry={editEntry}
          onDismiss={() => setEditEntry(null)}
          onSaved={handleEditSaved}
          onDeleted={handleEditDeleted}
        />
      )}

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
    padding: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.xl,
  },
  macroCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
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
  micFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
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
