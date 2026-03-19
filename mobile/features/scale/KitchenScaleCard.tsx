import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { UseScaleReturn } from './useScale';

type Props = UseScaleReturn;

export function KitchenScaleCard({
  sessionState,
  reading,
  error,
  connect,
  disconnect,
  simulate,
  cancelScan,
}: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const isConnected = sessionState === 'connected';
  const isScanning = sessionState === 'scanning';
  const isConnecting = sessionState === 'connecting';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Idle / error state */}
      {(sessionState === 'idle' || sessionState === 'error') && (
        <View style={styles.row}>
          <Ionicons name="scale-outline" size={20} color={colors.textSecondary} />
          <View style={styles.flex}>
            <Pressable
              style={[styles.connectButton, { backgroundColor: colors.tint }]}
              onPress={connect}
            >
              <ThemedText style={[Typography.footnote, { color: '#fff', fontWeight: '600' }]}>
                Connect to Scale
              </ThemedText>
            </Pressable>
            {error != null && (
              <ThemedText style={[Typography.caption1, { color: colors.destructive, marginTop: Spacing.xs }]}>
                {error}
              </ThemedText>
            )}
          </View>
          {__DEV__ && (
            <Pressable onPress={simulate} hitSlop={8}>
              <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
                Simulate
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {/* Scanning state */}
      {isScanning && (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.tint} />
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary, flex: 1 }]}>
            Scanning for scale…
          </ThemedText>
          <Pressable onPress={cancelScan} hitSlop={8}>
            <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Connecting state */}
      {isConnecting && (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.tint} />
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
            Connecting…
          </ThemedText>
        </View>
      )}

      {/* Connected — no reading yet */}
      {isConnected && reading == null && (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.tint} />
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary, flex: 1 }]}>
            Waiting for scale…
          </ThemedText>
          <Pressable onPress={disconnect} hitSlop={8}>
            <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
              Disconnect
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Connected — reading present */}
      {isConnected && reading != null && (
        <View style={styles.readingLayout}>
          <View style={styles.readingLeft}>
            {/* Stable / measuring badge */}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: reading.stable
                    ? colors.success + '20'
                    : colors.textSecondary + '20',
                },
              ]}
            >
              <ThemedText
                style={[
                  Typography.caption1,
                  {
                    color: reading.stable ? colors.success : colors.textSecondary,
                    fontWeight: '600',
                  },
                ]}
              >
                {reading.stable ? 'Stable' : 'Measuring…'}
              </ThemedText>
            </View>

            {/* Large weight value */}
            <ThemedText
              style={[styles.weightText, { color: reading.stable ? colors.tint : colors.text }]}
            >
              {reading.display}
            </ThemedText>

            {/* Unit */}
            <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
              {reading.unit}
            </ThemedText>
          </View>

          <Pressable onPress={disconnect} hitSlop={8} style={styles.disconnectButton}>
            <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
              Disconnect
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flex: {
    flex: 1,
  },
  connectButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  readingLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  readingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  weightText: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  disconnectButton: {
    alignSelf: 'flex-end',
  },
});
