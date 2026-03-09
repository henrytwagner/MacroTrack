import { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import FrequentFoodRow from '@/components/FrequentFoodRow';
import FoodSearchResult from '@/components/FoodSearchResult';
import FoodDetailSheet from '@/components/FoodDetailSheet';
import CreateFoodSheet from '@/components/CreateFoodSheet';
import CustomFoodList from '@/components/CustomFoodList';
import { useDateStore, todayString } from '@/stores/dateStore';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import type {
  FrequentFood,
  RecentFood,
  CustomFood,
  USDASearchResult,
  UnifiedSearchResponse,
  MealLabel,
} from '@shared/types';
import * as api from '@/services/api';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function getMealLabel(): MealLabel {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AddFoodScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const selectedDate = useDateStore((s) => s.selectedDate);
  const fetchDailyLog = useDailyLogStore((s) => s.fetch);
  const isToday = selectedDate === todayString();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([]);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  const [isFetchingLists, setIsFetchingLists] = useState(true);

  const [detailFood, setDetailFood] = useState<USDASearchResult | CustomFood | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [createPrefillName, setCreatePrefillName] = useState<string | undefined>();
  const [editingCustomFood, setEditingCustomFood] = useState<CustomFood | undefined>();
  const [showMyFoods, setShowMyFoods] = useState(false);
  const [myFoodsRefreshKey, setMyFoodsRefreshKey] = useState(0);

  const fetchFrequentRecent = useCallback(async () => {
    setIsFetchingLists(true);
    try {
      const [freq, rec] = await Promise.all([
        api.getFrequentFoods(),
        api.getRecentFoods(),
      ]);
      setFrequentFoods(freq);
      setRecentFoods(rec);
    } catch {
      // silent
    } finally {
      setIsFetchingLists(false);
    }
  }, []);

  useEffect(() => {
    fetchFrequentRecent();
  }, [fetchFrequentRecent]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchFoods(query.trim());
        setSearchResults(results);
      } catch {
        setSearchResults({ myFoods: [], database: [] });
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const isShowingSearch = query.trim().length >= MIN_QUERY_LENGTH;
  const hasSearchResults =
    searchResults &&
    (searchResults.myFoods.length > 0 || searchResults.database.length > 0);

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
          date: selectedDate,
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
        fetchDailyLog(selectedDate);
        fetchFrequentRecent();
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [selectedDate, fetchDailyLog, fetchFrequentRecent],
  );

  const handleFoodNamePress = useCallback(
    (food: FrequentFood | RecentFood) => {
      const isFrequent = 'logCount' in food;
      if (food.customFoodId) {
        const asCustom: CustomFood = {
          id: food.customFoodId,
          name: food.name,
          servingSize: isFrequent
            ? (food as FrequentFood).lastQuantity
            : (food as RecentFood).quantity,
          servingUnit: isFrequent
            ? (food as FrequentFood).lastUnit
            : (food as RecentFood).unit,
          calories: food.macros.calories,
          proteinG: food.macros.proteinG,
          carbsG: food.macros.carbsG,
          fatG: food.macros.fatG,
          createdAt: '',
          updatedAt: '',
        };
        setDetailFood(asCustom);
      } else {
        const asUsda: USDASearchResult = {
          fdcId: food.usdaFdcId ?? 0,
          description: food.name,
          servingSize: isFrequent
            ? (food as FrequentFood).lastQuantity
            : (food as RecentFood).quantity,
          servingSizeUnit: isFrequent
            ? (food as FrequentFood).lastUnit
            : (food as RecentFood).unit,
          macros: food.macros,
        };
        setDetailFood(asUsda);
      }
    },
    [],
  );

  const handleSearchResultPress = useCallback(
    (food: USDASearchResult | CustomFood) => {
      Keyboard.dismiss();
      setDetailFood(food);
    },
    [],
  );

  const handleDetailDismiss = useCallback(() => setDetailFood(null), []);

  const handleDetailSaved = useCallback(() => {
    setDetailFood(null);
    fetchDailyLog(selectedDate);
    fetchFrequentRecent();
  }, [selectedDate, fetchDailyLog, fetchFrequentRecent]);

  const handleCreateFood = useCallback(() => {
    setCreatePrefillName(undefined);
    setEditingCustomFood(undefined);
    setShowCreateSheet(true);
  }, []);

  const handleCreateFromQuery = useCallback(() => {
    setCreatePrefillName(query.trim());
    setEditingCustomFood(undefined);
    setShowCreateSheet(true);
  }, [query]);

  const handleCreateDismiss = useCallback(() => {
    setShowCreateSheet(false);
    setCreatePrefillName(undefined);
    setEditingCustomFood(undefined);
  }, []);

  const handleCreateSaved = useCallback(() => {
    setShowCreateSheet(false);
    setCreatePrefillName(undefined);
    setEditingCustomFood(undefined);
    fetchFrequentRecent();
    setMyFoodsRefreshKey((k) => k + 1);
    if (isShowingSearch) {
      setQuery((q) => q + ' ');
      setTimeout(() => setQuery((q) => q.trimEnd()), 10);
    }
  }, [isShowingSearch, fetchFrequentRecent]);

  const handleEditCustomFood = useCallback((food: CustomFood) => {
    setEditingCustomFood(food);
    setShowCreateSheet(true);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResults(null);
    Keyboard.dismiss();
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>
          Log Food
        </ThemedText>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="close" size={24} color={colors.tint} />
        </Pressable>
      </View>

      {/* Past date indicator */}
      {!isToday && (
        <View style={[styles.dateIndicator, { backgroundColor: colors.warning + '20' }]}>
          <Ionicons name="calendar-outline" size={14} color={colors.warning} />
          <ThemedText style={[Typography.footnote, { color: colors.warning, fontWeight: '600' }]}>
            Logging to: {formatDateLabel(selectedDate)}
          </ThemedText>
        </View>
      )}

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search foods..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />
          {query.length > 0 && (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.tint },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleCreateFood}
        >
          <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
          <ThemedText style={[Typography.subhead, { color: '#FFFFFF', fontWeight: '600' }]}>
            Create Food
          </ThemedText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          onPress={() => setShowMyFoods(true)}
        >
          <ThemedText style={[Typography.subhead, { color: colors.tint, fontWeight: '600' }]}>
            My Foods
          </ThemedText>
        </Pressable>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {isShowingSearch ? (
          <>
            {isSearching && (
              <ActivityIndicator style={styles.searchLoader} size="small" color={colors.tint} />
            )}
            {!isSearching && searchResults && (
              <>
                {hasSearchResults ? (
                  <>
                    {searchResults.myFoods.length > 0 && (
                      <View style={styles.resultSection}>
                        <ThemedText style={[Typography.footnote, styles.sectionHeader, { color: colors.textSecondary }]}>
                          MY FOODS
                        </ThemedText>
                        {searchResults.myFoods.map((food) => (
                          <FoodSearchResult key={food.id} food={food} onPress={handleSearchResultPress} />
                        ))}
                      </View>
                    )}
                    {searchResults.database.length > 0 && (
                      <View style={styles.resultSection}>
                        <ThemedText style={[Typography.footnote, styles.sectionHeader, { color: colors.textSecondary }]}>
                          DATABASE
                        </ThemedText>
                        {searchResults.database.map((food) => (
                          <FoodSearchResult key={food.fdcId} food={food} onPress={handleSearchResultPress} />
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.noResults}>
                    <ThemedText style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                      No results found
                    </ThemedText>
                    <Pressable
                      style={({ pressed }) => [
                        styles.createFallback,
                        { borderColor: colors.tint },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={handleCreateFromQuery}
                    >
                      <Ionicons name="add" size={18} color={colors.tint} />
                      <ThemedText style={[Typography.subhead, { color: colors.tint }]}>
                        Create "{query.trim()}" as custom food
                      </ThemedText>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {isFetchingLists ? (
              <ActivityIndicator style={styles.searchLoader} size="large" color={colors.tint} />
            ) : (
              <>
                {frequentFoods.length > 0 && (
                  <View style={styles.resultSection}>
                    <ThemedText style={[Typography.footnote, styles.sectionHeader, { color: colors.textSecondary }]}>
                      FREQUENT
                    </ThemedText>
                    {frequentFoods.map((food, idx) => (
                      <FrequentFoodRow
                        key={`freq-${food.name}-${food.source}-${idx}`}
                        food={food}
                        onPressName={handleFoodNamePress}
                        onQuickAdd={handleQuickAdd}
                      />
                    ))}
                  </View>
                )}
                {recentFoods.length > 0 && (
                  <View style={styles.resultSection}>
                    <ThemedText style={[Typography.footnote, styles.sectionHeader, { color: colors.textSecondary }]}>
                      RECENT
                    </ThemedText>
                    {recentFoods.map((food, idx) => (
                      <FrequentFoodRow
                        key={`rec-${food.name}-${food.source}-${idx}`}
                        food={food}
                        onPressName={handleFoodNamePress}
                        onQuickAdd={handleQuickAdd}
                      />
                    ))}
                  </View>
                )}
                {frequentFoods.length === 0 && recentFoods.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="nutrition-outline" size={48} color={colors.textTertiary} />
                    <ThemedText style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md }]}>
                      Search for foods above or create your own to get started.
                    </ThemedText>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {detailFood && (
        <FoodDetailSheet
          food={detailFood}
          mode="add"
          selectedDate={selectedDate}
          onDismiss={handleDetailDismiss}
          onSaved={handleDetailSaved}
        />
      )}

      <CreateFoodSheet
        visible={showCreateSheet}
        prefillName={createPrefillName}
        editingFood={editingCustomFood}
        onDismiss={handleCreateDismiss}
        onSaved={handleCreateSaved}
      />

      <CustomFoodList
        visible={showMyFoods}
        onClose={() => setShowMyFoods(false)}
        onEditFood={handleEditCustomFood}
        refreshKey={myFoodsRefreshKey}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    paddingVertical: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 60,
  },
  searchLoader: { marginTop: Spacing.xl },
  resultSection: { marginTop: Spacing.lg },
  sectionHeader: {
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  noResults: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    gap: Spacing.lg,
  },
  createFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    borderStyle: 'dashed',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl * 2,
    paddingHorizontal: Spacing.xl,
  },
});
