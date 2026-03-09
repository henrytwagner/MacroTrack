import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { DraftItem } from '@shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number, decimals = 0): string {
  return n.toFixed(decimals);
}

const CREATING_FIELD_LABELS: Record<string, string> = {
  confirm: '…',
  servingSize: 'Serving size',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MacroChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.macroChip}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <ThemedText style={[Typography.caption2, styles.macroChipText]}>
        {fmt(value, label === 'cal' ? 0 : 1)}
        {label === 'cal' ? ' cal' : `g ${label}`}
      </ThemedText>
    </View>
  );
}

function SourceIcon({ source, color }: { source: 'DATABASE' | 'CUSTOM'; color: string }) {
  return (
    <Ionicons
      name={source === 'CUSTOM' ? 'person-circle-outline' : 'leaf-outline'}
      size={14}
      color={color}
    />
  );
}

// ---------------------------------------------------------------------------
// Normal card
// ---------------------------------------------------------------------------

function NormalCard({
  item,
  colors,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
}) {
  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <SourceIcon source={item.source} color={colors.textTertiary} />
      </View>
      <ThemedText
        style={[Typography.subhead, { color: colors.textSecondary }]}
      >
        {item.quantity} {item.unit}
      </ThemedText>
      <View style={styles.macroRow}>
        <MacroChip label="cal" value={item.calories} color={colors.caloriesAccent} />
        <MacroChip label="P" value={item.proteinG} color={colors.proteinAccent} />
        <MacroChip label="C" value={item.carbsG} color={colors.carbsAccent} />
        <MacroChip label="F" value={item.fatG} color={colors.fatAccent} />
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Clarifying card
// ---------------------------------------------------------------------------

function ClarifyingCard({
  item,
  colors,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
}) {
  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <Ionicons name="help-circle" size={18} color={colors.warning} />
      </View>
      {item.clarifyQuestion && (
        <ThemedText
          style={[Typography.subhead, { color: colors.warning }]}
        >
          {item.clarifyQuestion}
        </ThemedText>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Creating card
// ---------------------------------------------------------------------------

const CREATION_FIELD_ORDER = [
  'confirm',
  'servingSize',
  'calories',
  'protein',
  'carbs',
  'fat',
];

function CreatingCard({
  item,
  colors,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
}) {
  const progress = item.creatingProgress;
  const currentField = progress?.currentField ?? 'confirm';
  const currentIdx = CREATION_FIELD_ORDER.indexOf(currentField);

  // Fields that have been filled (before the current one)
  const filledFields = CREATION_FIELD_ORDER.slice(1, currentIdx); // skip "confirm"

  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <Ionicons name="add-circle-outline" size={18} color={colors.tint} />
      </View>

      <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
        Creating custom food…
      </ThemedText>

      {/* Show filled fields */}
      {filledFields.map((field) => {
        let valueStr = '';
        if (field === 'servingSize') {
          valueStr = `${progress?.servingSize ?? '?'} ${progress?.servingUnit ?? 'servings'}`;
        } else if (field === 'calories') {
          valueStr = `${progress?.calories ?? '?'} cal`;
        } else if (field === 'protein') {
          valueStr = `${progress?.proteinG ?? '?'}g protein`;
        } else if (field === 'carbs') {
          valueStr = `${progress?.carbsG ?? '?'}g carbs`;
        } else if (field === 'fat') {
          valueStr = `${progress?.fatG ?? '?'}g fat`;
        }
        return (
          <View key={field} style={styles.filledFieldRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
              {' '}{CREATING_FIELD_LABELS[field]}: {valueStr}
            </ThemedText>
          </View>
        );
      })}

      {/* Current field — pulsing prompt */}
      {currentField !== 'complete' && currentField !== 'confirm' && (
        <View style={[styles.currentFieldRow, { borderColor: colors.tint }]}>
          <ThemedText style={[Typography.footnote, { color: colors.tint }]}>
            {CREATING_FIELD_LABELS[currentField]}?
          </ThemedText>
          <View style={[styles.micDot, { backgroundColor: colors.tint }]} />
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DraftMealCardProps {
  item: DraftItem;
}

export default function DraftMealCard({ item }: DraftMealCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Pulse animation for clarifying state
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (item.state === 'clarifying') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [item.state, pulseAnim]);

  // Entry animation — slide up + fade in
  const entryAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entryAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const borderColor =
    item.state === 'clarifying'
      ? colors.warning
      : item.state === 'creating'
        ? colors.tint
        : colors.border;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor,
          opacity: Animated.multiply(entryAnim, pulseAnim),
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {item.state === 'normal' && <NormalCard item={item} colors={colors} />}
      {item.state === 'clarifying' && <ClarifyingCard item={item} colors={colors} />}
      {item.state === 'creating' && <CreatingCard item={item} colors={colors} />}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  foodName: {
    flex: 1,
  },
  macroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: 2,
  },
  macroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  macroDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  macroChipText: {
    opacity: 0.85,
  },
  filledFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  micDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
