import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function GoalsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.navHeader, { borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="chevron-back" size={26} color={colors.tint} />
        </Pressable>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>Daily Goals</ThemedText>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText style={[Typography.headline, { color: colors.text }]}>
            How do you want to set your goals?
          </ThemedText>
          <ThemedText style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
            Guided setup uses your profile to suggest targets. You can also set numbers manually—both end on the same edit screen.
          </ThemedText>
          <Pressable
            style={({ pressed }) => [
              styles.guidedPrimaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => router.push('/goals-guided')}
          >
            <Ionicons name="sparkles-outline" size={18} color="#FFFFFF" />
            <ThemedText style={[Typography.subhead, { color: '#FFFFFF', marginLeft: Spacing.xs, fontWeight: '600' }]}>
              Guided setup (recommended)
            </ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.manualSecondaryButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push('/goals-edit')}
          >
            <ThemedText style={[Typography.subhead, { color: colors.tint }]}>
              Set targets manually
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  },
  header: {
    gap: Spacing.sm,
  },
  guidedPrimaryButton: {
    marginTop: Spacing.lg,
    borderRadius: 14,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSecondaryButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
