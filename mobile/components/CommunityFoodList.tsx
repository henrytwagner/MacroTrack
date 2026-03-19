import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MacroInlineLine from '@/components/MacroInlineLine';
import type { CommunityFood } from '@shared/types';
import * as api from '@/services/api';

interface CommunityFoodListProps {
  visible: boolean;
  onClose: () => void;
  onEditFood: (food: CommunityFood) => void;
  refreshKey?: number;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#34C759',
  PENDING: '#FF9500',
  RETIRED: '#8E8E93',
};

export default function CommunityFoodList({
  visible,
  onClose,
  onEditFood,
  refreshKey,
}: CommunityFoodListProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [foods, setFoods] = useState<CommunityFood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchFoods = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getCommunityFoods({ status: 'ALL', limit: 100 });
      setFoods(result);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) fetchFoods();
  }, [visible, fetchFoods, refreshKey]);

  const confirmDelete = (food: CommunityFood) => {
    Alert.alert(
      'Delete Community Food',
      `Delete "${food.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteCommunityFood(food.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setFoods((prev) => prev.filter((f) => f.id !== food.id));
            } catch (e) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              const message =
                e instanceof api.ApiError ? e.message : (e as Error)?.message ?? 'Could not delete.';
              Alert.alert('Could not delete', message);
            }
          },
        },
      ],
    );
  };

  const filteredFoods = query.trim()
    ? foods.filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        (f.brandName ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : foods;

  const renderItem = useCallback(
    ({ item }: { item: CommunityFood }) => {
      const statusColor = STATUS_COLORS[item.status] ?? STATUS_COLORS.RETIRED;
      return (
        <View style={styles.foodRow}>
          <Pressable
            style={({ pressed }) => [styles.foodInfo, pressed && { opacity: 0.6 }]}
            onPress={() => onEditFood(item)}
          >
            <View style={styles.nameRow}>
              <ThemedText
                style={[Typography.body, { color: colors.text, flex: 1 }]}
                numberOfLines={1}
              >
                {item.name}
              </ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
                <ThemedText style={[Typography.caption2, { color: statusColor, fontWeight: '600' }]}>
                  {item.status}
                </ThemedText>
              </View>
            </View>
            <MacroInlineLine
              prefix={`${item.defaultServingSize} ${item.defaultServingUnit} · ${item.usesCount} uses`}
              macros={item}
              colors={{ ...colors, textSecondary: colors.textSecondary }}
              textStyle="footnote"
            />
          </Pressable>
          <Pressable
            onPress={() => confirmDelete(item)}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      );
    },
    [colors, onEditFood],
  );

  if (!visible) return null;

  const listContent = isLoading ? (
    <ActivityIndicator style={styles.loader} size="large" color={colors.tint} />
  ) : filteredFoods.length === 0 ? (
    <View style={styles.emptyState}>
      <Ionicons name="globe-outline" size={48} color={colors.textTertiary} />
      <ThemedText
        style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.md }]}
      >
        {query.trim() ? 'No foods match your search.' : 'No community foods found.'}
      </ThemedText>
    </View>
  ) : (
    <FlatList
      data={filteredFoods}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
      )}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.tint} />
        </Pressable>
        <ThemedText style={[Typography.title3, { color: colors.text }]}>
          Community Foods
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.surfaceSecondary }]}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search community foods…"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {listContent}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  searchInput: {
    ...Typography.body,
    flex: 1,
    paddingVertical: 0,
  },
  loader: {
    marginTop: Spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: 100,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  foodInfo: {
    flex: 1,
    gap: 3,
    marginRight: Spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
