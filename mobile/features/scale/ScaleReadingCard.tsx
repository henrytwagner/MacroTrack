import { useState } from 'react';
import { View, StyleSheet, Pressable, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { ScaleReading } from './types';

const UNIT_LABELS: Record<string, string> = {
  g: 'Grams',
  ml: 'ml',
  oz: 'oz',
  'lb:oz': 'lb : oz',
};

// Builds a tab-separated row for pasting into the reverse-engineering spreadsheet.
// Columns: Timestamp | Display | Unit | Stable | B0 B1 … B11 | Full Hex
function buildTsvRow(reading: ScaleReading): string {
  const ts = new Date().toISOString();
  const byteTokens = reading.rawHex.split(/\s+/).filter((t) => /^[0-9A-Fa-f]{2}$/.test(t));
  const byteValues = byteTokens.map((t) => parseInt(t, 16));
  while (byteValues.length < 12) byteValues.push(NaN);
  const byteCols = byteValues
    .slice(0, 12)
    .map((b) => (isNaN(b) ? '' : b.toString()))
    .join('\t');
  // Column B is intentionally blank — fill in what the physical scale LCD shows.
  // App-parsed value moved to the end as reference only (may be wrong).
  return [ts, '', reading.unit, reading.stable ? 'stable' : 'measuring', byteCols, reading.rawHex, `app_parsed:${reading.display}`].join('\t');
}

interface ScaleReadingCardProps {
  reading: ScaleReading;
  isSimulated?: boolean;
}

export function ScaleReadingCard({ reading, isSimulated = false }: ScaleReadingCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [hexExpanded, setHexExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Share.share({ message: buildTsvRow(reading) });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Badges row */}
      <View style={styles.badgeRow}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: reading.stable
                ? colors.tint + '20'
                : colors.textSecondary + '20',
            },
          ]}
        >
          <ThemedText
            style={[
              Typography.caption1,
              {
                color: reading.stable ? colors.tint : colors.textSecondary,
                fontWeight: '600',
              },
            ]}
          >
            {reading.stable ? 'Stable' : 'Measuring…'}
          </ThemedText>
        </View>

        <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
          <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
            {UNIT_LABELS[reading.unit] ?? reading.unit}
          </ThemedText>
        </View>

        {isSimulated && (
          <View style={[styles.badge, { backgroundColor: colors.warning + '20' }]}>
            <ThemedText style={[Typography.caption1, { color: colors.warning, fontWeight: '600' }]}>
              Simulated
            </ThemedText>
          </View>
        )}
      </View>

      {/* Large weight display */}
      <ThemedText
        style={[styles.weightText, { color: reading.stable ? colors.tint : colors.text }]}
      >
        {reading.display}
      </ThemedText>

      {/* Copy button */}
      <Pressable
        style={[
          styles.copyButton,
          { backgroundColor: copied ? colors.success + '20' : colors.surfaceSecondary, borderColor: copied ? colors.success : colors.border },
        ]}
        onPress={handleCopy}
      >
        <Ionicons
          name={copied ? 'checkmark' : 'copy-outline'}
          size={14}
          color={copied ? colors.success : colors.textSecondary}
        />
        <ThemedText
          style={[Typography.caption1, { color: copied ? colors.success : colors.textSecondary, fontWeight: '600' }]}
        >
          {copied ? 'Shared!' : 'Share row'}
        </ThemedText>
      </Pressable>

      {/* Collapsible raw hex */}
      <Pressable
        style={styles.hexToggle}
        onPress={() => setHexExpanded((v) => !v)}
      >
        <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
          Raw hex
        </ThemedText>
        <Ionicons
          name={hexExpanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={colors.textTertiary}
        />
      </Pressable>

      {hexExpanded && (
        <View style={[styles.hexBlock, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}>
          <ThemedText
            style={[Typography.caption2, { color: colors.textSecondary, fontFamily: 'monospace' }]}
          >
            {reading.rawHex}
          </ThemedText>
          <ThemedText
            style={[Typography.caption2, { color: colors.textTertiary, marginTop: Spacing.xs, fontStyle: 'italic' }]}
          >
            B6=sign, B7:B8=weight (big-endian), B9=unit (00=g 01=lb:oz 02=ml 04=ml-density 06=oz)
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
    width: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  weightText: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  hexToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  hexBlock: {
    width: '100%',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
});
