import { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Alert,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import FrequentFoodRow from '@/components/FrequentFoodRow';
import FoodSearchResult from '@/components/FoodSearchResult';
import FoodDetailSheet from '@/components/FoodDetailSheet';
import CreateFoodSheet from '@/components/CreateFoodSheet';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useDateStore, todayString } from '@/stores/dateStore';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import type {
  FrequentFood,
  RecentFood,
  CustomFood,
  CommunityFood,
  USDASearchResult,
  UnifiedSearchResponse,
  MealLabel,
  FoodEntry,
} from '@shared/types';
import { type SearchItem, isCommunityFood } from '@/components/FoodSearchResult';
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

/** Build a food shape from an existing log entry so FoodDetailSheet can edit it. */
function foodFromEntry(entry: FoodEntry): SearchItem {
  if (entry.source === 'CUSTOM' && entry.customFoodId) {
    return {
      id: entry.customFoodId,
      name: entry.name,
      servingSize: entry.quantity,
      servingUnit: entry.unit,
      calories: entry.calories,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      createdAt: '',
      updatedAt: '',
    };
  }
  if (entry.source === 'COMMUNITY' && entry.communityFoodId) {
    return {
      id: entry.communityFoodId,
      name: entry.name,
      defaultServingSize: entry.quantity,
      defaultServingUnit: entry.unit,
      calories: entry.calories,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
      status: 'ACTIVE' as const,
      usesCount: 0,
      reportsCount: 0,
      trustScore: 0.5,
      createdAt: '',
      updatedAt: '',
    };
  }
  return {
    fdcId: entry.usdaFdcId ?? 0,
    description: entry.name,
    servingSize: entry.quantity,
    servingSizeUnit: entry.unit,
    macros: {
      calories: entry.calories,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
    },
  };
}

export default function AddFoodScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { width: pageWidth } = useWindowDimensions();

  const selectedDate = useDateStore((s) => s.selectedDate);
  const entries = useDailyLogStore((s) => s.entries);
  const fetchDailyLog = useDailyLogStore((s) => s.fetch);
  const addEntry = useDailyLogStore((s) => s.addEntry);
  const removeEntry = useDailyLogStore((s) => s.removeEntry);
  const commitDelete = useDailyLogStore((s) => s.commitDelete);
  const isToday = selectedDate === todayString();
  const { editEntryId } = useLocalSearchParams<{ editEntryId?: string }>();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showUsda, setShowUsda] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'myFoods' | 'meals'>('search');
  const tabPagerRef = useRef<ScrollView | null>(null);

  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([]);
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  const [isFetchingLists, setIsFetchingLists] = useState(true);

  const [detailFood, setDetailFood] = useState<SearchItem | null>(null);
  const [existingEntry, setExistingEntry] = useState<FoodEntry | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [createPrefillName, setCreatePrefillName] = useState<string | undefined>();
  const [editingCustomFood, setEditingCustomFood] = useState<CustomFood | undefined>();
  const [myFoodsRefreshKey, setMyFoodsRefreshKey] = useState(0);
  const [myFoodsTabFoods, setMyFoodsTabFoods] = useState<CustomFood[]>([]);
  const [isFetchingMyFoods, setIsFetchingMyFoods] = useState(true);
  const [lastAddedEntry, setLastAddedEntry] = useState<FoodEntry | null>(null);

  const [foodToPublish, setFoodToPublish] = useState<CustomFood | null>(null);
  const [showPublishSheet, setShowPublishSheet] = useState(false);
  const [communityIntent, setCommunityIntent] = useState(false);
  const [barcodeGtinForCommunity, setBarcodeGtinForCommunity] = useState<string | undefined>();
  const [isScanning, setIsScanning] = useState(false);

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

  const fetchMyFoodsTab = useCallback(async () => {
    setIsFetchingMyFoods(true);
    try {
      const result = await api.getCustomFoods();
      setMyFoodsTabFoods(result);
    } catch {
      setMyFoodsTabFoods([]);
    } finally {
      setIsFetchingMyFoods(false);
    }
  }, []);

  useEffect(() => {
    fetchMyFoodsTab();
  }, [fetchMyFoodsTab, myFoodsRefreshKey]);

  // Open sheet in edit mode when navigated with editEntryId (e.g. from Log tab).
  useEffect(() => {
    if (!editEntryId) return;
    const entry = entries.find((e) => e.id === editEntryId);
    if (entry) {
      setDetailFood(foodFromEntry(entry));
      setExistingEntry(entry);
    } else {
      fetchDailyLog(selectedDate);
    }
  }, [editEntryId, selectedDate, fetchDailyLog, entries]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSearchResults(null);
      setIsSearching(false);
      setShowUsda(false);
      return;
    }

    setShowUsda(false);
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchFoods(query.trim());
        setSearchResults(results);
      } catch {
        setSearchResults({ myFoods: [], community: [], database: [] });
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const isShowingSearch = query.trim().length >= MIN_QUERY_LENGTH;
  const filteredMyFoodsTab =
    query.trim().length > 0
      ? myFoodsTabFoods.filter((f) =>
          f.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : myFoodsTabFoods;
  const hasSearchResults =
    searchResults &&
    (searchResults.myFoods.length > 0 || searchResults.community.length > 0 || searchResults.database.length > 0);

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
        const entry = await api.createEntry({
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
          communityFoodId: food.communityFoodId,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addEntry(entry);
        setLastAddedEntry(entry);
        fetchFrequentRecent();
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [selectedDate, addEntry, fetchFrequentRecent],
  );

  const handleFoodNamePress = useCallback(
    (food: FrequentFood | RecentFood) => {
      setExistingEntry(null);
      const isFrequent = 'logCount' in food;
      const qty = isFrequent
        ? (food as FrequentFood).lastQuantity
        : (food as RecentFood).quantity;
      const unit = isFrequent
        ? (food as FrequentFood).lastUnit
        : (food as RecentFood).unit;

      if (food.communityFoodId) {
        const asCommunity: CommunityFood = {
          id: food.communityFoodId,
          name: food.name,
          defaultServingSize: qty,
          defaultServingUnit: unit,
          calories: food.macros.calories,
          proteinG: food.macros.proteinG,
          carbsG: food.macros.carbsG,
          fatG: food.macros.fatG,
          status: 'ACTIVE',
          usesCount: 0,
          reportsCount: 0,
          trustScore: 0.5,
          createdAt: '',
          updatedAt: '',
        };
        setDetailFood(asCommunity);
      } else if (food.customFoodId) {
        const asCustom: CustomFood = {
          id: food.customFoodId,
          name: food.name,
          servingSize: qty,
          servingUnit: unit,
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
          servingSize: qty,
          servingSizeUnit: unit,
          macros: food.macros,
        };
        setDetailFood(asUsda);
      }
    },
    [],
  );

  const handleSearchResultPress = useCallback(
    (food: SearchItem) => {
      Keyboard.dismiss();
      setExistingEntry(null);
      setDetailFood(food);
    },
    [],
  );

  const handleDetailDismiss = useCallback(() => {
    setDetailFood(null);
    setExistingEntry(null);
  }, []);

  const handleDetailSaved = useCallback(
    (createdEntry?: FoodEntry) => {
      if (createdEntry) {
        addEntry(createdEntry);
        setLastAddedEntry(createdEntry);
      }
      setDetailFood(null);
      setExistingEntry(null);
      fetchFrequentRecent();
    },
    [addEntry, fetchFrequentRecent],
  );

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
    setCommunityIntent(false);
    setBarcodeGtinForCommunity(undefined);
  }, []);

  const handleCreateSaved = useCallback((food?: CustomFood) => {
    setShowCreateSheet(false);
    setCreatePrefillName(undefined);
    setEditingCustomFood(undefined);
    setCommunityIntent(false);
    setBarcodeGtinForCommunity(undefined);
    fetchFrequentRecent();
    setMyFoodsRefreshKey((k) => k + 1);
    if (isShowingSearch) {
      setQuery((q) => q + ' ');
      setTimeout(() => setQuery((q) => q.trimEnd()), 10);
    }
    if (food && !editingCustomFood) {
      Alert.alert(
        'Share with the community?',
        'Make this food visible to all MacroTrack users. Your version becomes the community entry.',
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Review & Share',
            onPress: () => {
              setFoodToPublish(food);
              setShowPublishSheet(true);
            },
          },
        ],
      );
    }
  }, [isShowingSearch, fetchFrequentRecent, editingCustomFood]);

  const handleEditCustomFood = useCallback((food: CustomFood) => {
    setEditingCustomFood(food);
    setShowCreateSheet(true);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSearchResults(null);
    Keyboard.dismiss();
  }, []);

  const handleAddedUndo = useCallback(() => {
    if (lastAddedEntry) {
      removeEntry(lastAddedEntry.id);
      commitDelete(lastAddedEntry.id).catch(() => {});
      setLastAddedEntry(null);
      fetchFrequentRecent();
    }
  }, [lastAddedEntry, removeEntry, commitDelete, fetchFrequentRecent]);

  const handleAddedDismiss = useCallback(() => {
    setLastAddedEntry(null);
  }, []);

  const handleBarcodeScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const { scanWithCamera } = await import('@/features/barcode/scanner');
      const result = await scanWithCamera();
      if (!result) {
        setIsScanning(false);
        return;
      }
      const gtin = result.gtin;
      const communityFood = await api.lookupBarcode(gtin);
      if (communityFood) {
        setDetailFood(communityFood);
      } else {
        Alert.alert(
          'Product not recognized',
          "This barcode isn't in our database yet. How would you like to add it?",
          [
            {
              text: 'Save as My Food',
              onPress: () => {
                setCreatePrefillName('');
                setEditingCustomFood(undefined);
                setCommunityIntent(false);
                setShowCreateSheet(true);
              },
            },
            {
              text: 'Add to Community',
              onPress: () => {
                setBarcodeGtinForCommunity(gtin);
                setCreatePrefillName('');
                setEditingCustomFood(undefined);
                setCommunityIntent(true);
                setShowCreateSheet(true);
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      }
    } catch {
      // scan failed or denied — silent
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleCreateForCommunity = useCallback(() => {
    setCreatePrefillName(query.trim());
    setEditingCustomFood(undefined);
    setCommunityIntent(true);
    setBarcodeGtinForCommunity(undefined);
    setShowCreateSheet(true);
  }, [query]);

  const handlePublishDismiss = useCallback(() => {
    setShowPublishSheet(false);
    setFoodToPublish(null);
  }, []);

  const handlePublishSaved = useCallback(() => {
    setShowPublishSheet(false);
    setFoodToPublish(null);
    setMyFoodsRefreshKey((k) => k + 1);
    fetchFrequentRecent();
  }, [fetchFrequentRecent]);

  const handleFork = useCallback((newCustomFood: CustomFood) => {
    setDetailFood(null);
    setEditingCustomFood(newCustomFood);
    setShowCreateSheet(true);
  }, []);

  const handleQuickAddFromSearchItem = useCallback(
    async (food: SearchItem) => {
      if (!('servingSize' in food) || !('servingUnit' in food)) {
        return;
      }
      try {
        const entry = await api.createEntry({
          date: selectedDate,
          name: food.name,
          calories: food.calories,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatG: food.fatG,
          quantity: food.servingSize,
          unit: food.servingUnit,
          source: 'CUSTOM',
          mealLabel: getMealLabel(),
          customFoodId: 'id' in food ? (food as CustomFood).id : undefined,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addEntry(entry);
        setLastAddedEntry(entry);
        fetchFrequentRecent();
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [selectedDate, addEntry, fetchFrequentRecent],
  );

  const handleTabPress = useCallback(
    (tab: 'search' | 'myFoods' | 'meals') => {
      setActiveTab(tab);
      const index = tab === 'search' ? 0 : tab === 'myFoods' ? 1 : 2;
      tabPagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    },
    [pageWidth],
  );

  const handleTabPagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const index = Math.round(x / pageWidth);
      const nextTab = index === 0 ? 'search' : index === 1 ? 'myFoods' : 'meals';
      if (nextTab !== activeTab) {
        setActiveTab(nextTab);
      }
    },
    [pageWidth, activeTab],
  );

  // Edit flow: show only the form (same as add), no list. Same page, same info + quantity.
  const isEditMode = Boolean(editEntryId && detailFood && existingEntry);
  if (editEntryId && !existingEntry) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Ionicons name="chevron-back" size={28} color={colors.tint} />
          </Pressable>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>Edit Entry</ThemedText>
          <View style={{ width: 28 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }
  if (isEditMode && detailFood && existingEntry) {
    return (
      <FoodDetailSheet
        food={detailFood}
        mode="edit"
        existingEntry={existingEntry}
        selectedDate={selectedDate}
        onDismiss={() => {
          setDetailFood(null);
          setExistingEntry(null);
          router.back();
        }}
        onSaved={() => {
          handleDetailSaved();
          router.back();
        }}
        onDeleted={() => {
          handleDetailSaved();
          router.back();
        }}
        onEditCustomFood={(customFood) => {
          setDetailFood(null);
          setExistingEntry(null);
          setEditingCustomFood(customFood);
          setShowCreateSheet(true);
        }}
        onPublishCustomFood={(customFood) => {
          setDetailFood(null);
          setExistingEntry(null);
          setFoodToPublish(customFood);
          setShowPublishSheet(true);
        }}
        asFullScreen
      />
    );
  }

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

      {/* Search bar + create food */}
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
          />
          {query.length > 0 && (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
          <Pressable onPress={handleBarcodeScan} hitSlop={8} disabled={isScanning}>
            {isScanning ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <Ionicons name="barcode-outline" size={22} color={colors.tint} />
            )}
          </Pressable>
        </View>
        <Pressable
          onPress={handleCreateFood}
          style={({ pressed }) => [
            styles.searchBarAction,
            { borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={22} color={colors.tint} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <Pressable
          style={styles.tabButton}
          onPress={() => handleTabPress('search')}
        >
          <ThemedText
            style={[
              Typography.subhead,
              { color: activeTab === 'search' ? colors.text : colors.textSecondary },
            ]}
          >
            Recommended
          </ThemedText>
          {activeTab === 'search' && (
            <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} />
          )}
        </Pressable>
        <Pressable
          style={styles.tabButton}
          onPress={() => handleTabPress('myFoods')}
        >
          <ThemedText
            style={[
              Typography.subhead,
              { color: activeTab === 'myFoods' ? colors.text : colors.textSecondary },
            ]}
          >
            Your foods
          </ThemedText>
          {activeTab === 'myFoods' && (
            <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} />
          )}
        </Pressable>
        <Pressable
          style={styles.tabButton}
          onPress={() => handleTabPress('meals')}
        >
          <ThemedText
            style={[
              Typography.subhead,
              { color: activeTab === 'meals' ? colors.text : colors.textSecondary },
            ]}
          >
            Meals
          </ThemedText>
          {activeTab === 'meals' && (
            <View style={[styles.tabUnderline, { backgroundColor: colors.tint }]} />
          )}
        </Pressable>
      </View>

      {/* Tab content: horizontal pager */}
      <ScrollView
        ref={tabPagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.tabPager}
        onMomentumScrollEnd={handleTabPagerScrollEnd}
      >
        {/* Search tab page */}
        <View style={[styles.tabPage, { width: pageWidth }]}>
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
                        <ThemedText
                          style={[
                            Typography.footnote,
                            styles.sectionHeader,
                            { color: colors.textSecondary },
                          ]}
                        >
                          MY FOODS
                        </ThemedText>
                        <View
                          style={[
                            styles.listCard,
                            { backgroundColor: colors.surface },
                          ]}
                        >
                          {searchResults.myFoods.map((food, idx) => (
                            <View key={food.id}>
                              {idx > 0 && (
                                <View
                                  style={[
                                    styles.separator,
                                    { backgroundColor: colors.borderLight },
                                  ]}
                                />
                              )}
                              <FoodSearchResult
                                food={food}
                                onPress={handleSearchResultPress}
                                onQuickAdd={handleQuickAddFromSearchItem}
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {searchResults.community.length > 0 && (
                      <View style={styles.resultSection}>
                        <ThemedText
                          style={[
                            Typography.footnote,
                            styles.sectionHeader,
                            { color: colors.textSecondary },
                          ]}
                        >
                          COMMUNITY
                        </ThemedText>
                        <View
                          style={[
                            styles.listCard,
                            { backgroundColor: colors.surface },
                          ]}
                        >
                          {searchResults.community.map((food, idx) => (
                            <View key={food.id}>
                              {idx > 0 && (
                                <View
                                  style={[
                                    styles.separator,
                                    { backgroundColor: colors.borderLight },
                                  ]}
                                />
                              )}
                              <FoodSearchResult
                                food={food}
                                onPress={handleSearchResultPress}
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {searchResults.database.length > 0 && (
                      <View style={styles.resultSection}>
                        <Pressable
                          style={[styles.usdaToggleRow, { borderColor: colors.border }]}
                          onPress={() => setShowUsda((v) => !v)}
                        >
                          <ThemedText
                            style={[Typography.footnote, { color: colors.textSecondary, flex: 1 }]}
                          >
                            {showUsda
                              ? `Hide USDA results (${searchResults.database.length})`
                              : `Show USDA results (${searchResults.database.length})`}
                          </ThemedText>
                          <Ionicons
                            name={showUsda ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                        {showUsda && (
                          <View
                            style={[
                              styles.listCard,
                              { backgroundColor: colors.surface },
                            ]}
                          >
                            {searchResults.database.map((food, idx) => (
                              <View key={food.fdcId}>
                                {idx > 0 && (
                                  <View
                                    style={[
                                      styles.separator,
                                      { backgroundColor: colors.borderLight },
                                    ]}
                                  />
                                )}
                                <FoodSearchResult
                                  food={food}
                                  onPress={handleSearchResultPress}
                                />
                              </View>
                            ))}
                          </View>
                        )}
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
                    <Pressable
                      style={({ pressed }) => [
                        styles.createFallback,
                        { borderColor: colors.tint },
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={handleCreateForCommunity}
                    >
                      <Ionicons name="people-outline" size={18} color={colors.tint} />
                      <ThemedText style={[Typography.subhead, { color: colors.tint }]}>
                        Add "{query.trim()}" to Community
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
                    <ThemedText
                      style={[
                        Typography.footnote,
                        styles.sectionHeader,
                        { color: colors.textSecondary },
                      ]}
                    >
                      FREQUENT
                    </ThemedText>
                    <View
                      style={[
                        styles.listCard,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      {frequentFoods.map((food, idx) => (
                        <View
                          key={`freq-${food.name}-${food.source}-${idx}`}
                        >
                          {idx > 0 && (
                            <View
                              style={[
                                styles.separator,
                                { backgroundColor: colors.borderLight },
                              ]}
                            />
                          )}
                          <FrequentFoodRow
                            food={food}
                            onPressName={handleFoodNamePress}
                            onQuickAdd={handleQuickAdd}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                {recentFoods.length > 0 && (
                  <View style={styles.resultSection}>
                    <ThemedText
                      style={[
                        Typography.footnote,
                        styles.sectionHeader,
                        { color: colors.textSecondary },
                      ]}
                    >
                      RECENT
                    </ThemedText>
                    <View
                      style={[
                        styles.listCard,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      {recentFoods.map((food, idx) => (
                        <View
                          key={`rec-${food.name}-${food.source}-${idx}`}
                        >
                          {idx > 0 && (
                            <View
                              style={[
                                styles.separator,
                                { backgroundColor: colors.borderLight },
                              ]}
                            />
                          )}
                          <FrequentFoodRow
                            food={food}
                            onPressName={handleFoodNamePress}
                            onQuickAdd={handleQuickAdd}
                          />
                        </View>
                      ))}
                    </View>
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
        </View>

        {/* Your foods tab page */}
        <View style={[styles.tabPage, { width: pageWidth }]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {isFetchingMyFoods ? (
              <ActivityIndicator style={styles.searchLoader} size="large" color={colors.tint} />
            ) : filteredMyFoodsTab.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="restaurant-outline" size={48} color={colors.textTertiary} />
                <ThemedText
                  style={[
                    Typography.body,
                    { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
                  ]}
                >
                  {query.trim().length > 0
                    ? 'No matching foods. Try a different search.'
                    : 'No custom foods yet. Create one with the + button or from Search.'}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.resultSection}>
                <ThemedText
                  style={[
                    Typography.footnote,
                    styles.sectionHeader,
                    { color: colors.textSecondary },
                  ]}
                >
                  YOUR FOODS
                </ThemedText>
                <View style={[styles.listCard, { backgroundColor: colors.surface }]}>
                  {filteredMyFoodsTab.map((food, idx) => (
                    <View key={food.id}>
                      {idx > 0 && (
                        <View
                          style={[
                            styles.separator,
                            { backgroundColor: colors.borderLight },
                          ]}
                        />
                      )}
                      <FoodSearchResult
                        food={food}
                        onPress={handleSearchResultPress}
                        onQuickAdd={handleQuickAddFromSearchItem}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Meals tab page */}
        <View style={[styles.tabPage, { width: pageWidth }]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={48} color={colors.textTertiary} />
              <ThemedText
                style={[
                  Typography.body,
                  { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
                ]}
              >
                Meals are coming soon. You’ll be able to save and reuse meals here.
              </ThemedText>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {detailFood && (
        <FoodDetailSheet
          food={detailFood}
          mode={existingEntry ? 'edit' : 'add'}
          existingEntry={existingEntry ?? undefined}
          selectedDate={selectedDate}
          onDismiss={handleDetailDismiss}
          onSaved={handleDetailSaved}
          onDeleted={handleDetailSaved}
          onFork={handleFork}
          onEditCustomFood={(customFood) => {
            setDetailFood(null);
            setExistingEntry(null);
            setEditingCustomFood(customFood);
            setShowCreateSheet(true);
          }}
          onPublishCustomFood={(customFood) => {
            setDetailFood(null);
            setExistingEntry(null);
            setFoodToPublish(customFood);
            setShowPublishSheet(true);
          }}
          onDeleteCustomFood={() => {
            setMyFoodsRefreshKey((k) => k + 1);
            fetchFrequentRecent();
          }}
        />
      )}

      <CreateFoodSheet
        visible={showCreateSheet}
        prefillName={createPrefillName}
        editingFood={editingCustomFood}
        intent={communityIntent ? 'community' : 'custom'}
        prefillBarcode={barcodeGtinForCommunity}
        onDismiss={handleCreateDismiss}
        onSaved={handleCreateSaved}
        onPublishRequest={(food) => {
          setShowCreateSheet(false);
          setEditingCustomFood(undefined);
          setFoodToPublish(food);
          setShowPublishSheet(true);
          setMyFoodsRefreshKey((k) => k + 1);
          fetchFrequentRecent();
        }}
        onDeleted={() => {
          setMyFoodsRefreshKey((k) => k + 1);
          fetchFrequentRecent();
        }}
      />

      {showPublishSheet && foodToPublish && (
        <CreateFoodSheet
          visible={showPublishSheet}
          intent="community"
          prefillCommunityFood={{
            id: '',
            name: foodToPublish.name,
            defaultServingSize: foodToPublish.servingSize,
            defaultServingUnit: foodToPublish.servingUnit,
            calories: foodToPublish.calories,
            proteinG: foodToPublish.proteinG,
            carbsG: foodToPublish.carbsG,
            fatG: foodToPublish.fatG,
            sodiumMg: foodToPublish.sodiumMg,
            cholesterolMg: foodToPublish.cholesterolMg,
            fiberG: foodToPublish.fiberG,
            sugarG: foodToPublish.sugarG,
            saturatedFatG: foodToPublish.saturatedFatG,
            transFatG: foodToPublish.transFatG,
            status: 'ACTIVE',
            usesCount: 0,
            reportsCount: 0,
            trustScore: 0.5,
            createdAt: '',
            updatedAt: '',
          }}
          sourceCustomFoodId={foodToPublish.id}
          onDismiss={handlePublishDismiss}
          onSaved={handlePublishSaved}
        />
      )}

      <UndoSnackbar
        message={lastAddedEntry ? `Added ${lastAddedEntry.name}.` : ''}
        visible={!!lastAddedEntry}
        onUndo={handleAddedUndo}
        onDismiss={handleAddedDismiss}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },
  searchBarAction: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    paddingVertical: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  tabPager: {
    flex: 1,
  },
  tabPage: {
    flex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  tabUnderline: {
    marginTop: 2,
    height: 2,
    borderRadius: 1,
    alignSelf: 'stretch',
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
  listCard: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg,
  },
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
  usdaToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.sm,
  },
});
