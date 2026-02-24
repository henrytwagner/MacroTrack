import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import DateHeader from '@/components/DateHeader';
import MacroProgressBar from '@/components/MacroProgressBar';
import MealGroup from '@/components/MealGroup';
import EditEntrySheet from '@/components/EditEntrySheet';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useDateStore, todayString } from '@/stores/dateStore';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useGoalStore } from '@/stores/goalStore';
import type { FoodEntry, MealLabel } from '@shared/types';

const MEAL_ORDER: MealLabel[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const selectedDate = useDateStore((s) => s.selectedDate);
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

  useEffect(() => {
    fetchGoals();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEntries(selectedDate);
    }, [selectedDate, fetchEntries]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEntries(selectedDate), fetchGoals()]);
    setRefreshing(false);
  }, [selectedDate]);

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
      commitDelete(deletedEntry.id).catch(() => {
        // Silent fail — user can pull-to-refresh to restore consistency
      });
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

  const isToday = selectedDate === todayString();
  const hasEntries = entries.length > 0;
  const hasGoals = goals !== null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <DateHeader />

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
        {/* Macro Progress Section */}
        <View
          style={[
            styles.macroCard,
            { backgroundColor: colors.surface },
          ]}
        >
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
                style={[
                  Typography.subhead,
                  { color: colors.textSecondary, textAlign: 'center' },
                ]}
              >
                Set your daily goals to track progress.
              </ThemedText>
            </View>
          )}
        </View>

        {/* Food Log Section */}
        {isLoading && !refreshing ? (
          <ActivityIndicator
            style={styles.loader}
            size="large"
            color={colors.tint}
          />
        ) : error ? (
          <View style={styles.emptyState}>
            <ThemedText
              style={[
                Typography.body,
                { color: colors.destructive, textAlign: 'center' },
              ]}
            >
              Unable to connect to server. Check your connection.
            </ThemedText>
          </View>
        ) : !hasEntries ? (
          <View style={styles.emptyState}>
            <ThemedText
              style={[
                Typography.body,
                { color: colors.textSecondary, textAlign: 'center' },
              ]}
            >
              {isToday
                ? 'No entries yet today. Tap the Log tab to get started.'
                : 'No entries for this day. You can add entries retroactively from the Log tab.'}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
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
  },
  mealGroups: {
    gap: Spacing.xl,
  },
});
