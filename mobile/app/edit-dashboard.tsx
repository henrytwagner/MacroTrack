import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDashboardLayoutStore } from '@/stores/dashboardLayoutStore';
import {
  LAYOUT_IDS,
  LAYOUT_LABELS,
  type MacroLayoutId,
} from '@/components/DashboardMacroLayouts';

export default function EditDashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { layoutId, setLayoutId } = useDashboardLayoutStore();

  const handleSelect = (id: MacroLayoutId) => {
    Haptics.selectionAsync();
    setLayoutId(id);
  };

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
          Edit dashboard
        </ThemedText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <ThemedText
            style={[Typography.subhead, { color: colors.textSecondary, marginBottom: Spacing.sm }]}
          >
            Progress display
          </ThemedText>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {LAYOUT_IDS.map((id, index) => {
              const isSelected = layoutId === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => handleSelect(id)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText style={[Typography.body, { color: colors.text }]}>
                    {LAYOUT_LABELS[id]}
                  </ThemedText>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.tint} />
                  ) : (
                    <View style={[styles.radioOuter, { borderColor: colors.border }]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  section: {
    gap: Spacing.xs,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
});
