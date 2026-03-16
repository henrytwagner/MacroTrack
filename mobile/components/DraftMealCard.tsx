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

function isNumericField(field: string): boolean {
  return ['calories', 'protein', 'carbs', 'fat', 'servingSize'].includes(field);
}

function fireFlash(anim: Animated.Value) {
  Animated.sequence([
    Animated.spring(anim, {
      toValue: 1.25,
      useNativeDriver: true,
      friction: 6,
      tension: 300,
    }),
    Animated.spring(anim, {
      toValue: 1.0,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }),
  ]).start();
}

interface FlashAnims {
  quantityScale: Animated.Value;
  caloriesScale: Animated.Value;
  proteinScale: Animated.Value;
  carbsScale: Animated.Value;
  fatScale: Animated.Value;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MacroChip({
  label,
  value,
  color,
  scaleAnim,
}: {
  label: string;
  value: number;
  color: string;
  scaleAnim?: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        styles.macroChip,
        scaleAnim ? { transform: [{ scale: scaleAnim }] } : undefined,
      ]}
    >
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <ThemedText style={[Typography.caption2, styles.macroChipText]}>
        {fmt(value, label === 'cal' ? 0 : 1)}
        {label === 'cal' ? ' cal' : `g ${label}`}
      </ThemedText>
    </Animated.View>
  );
}

function SourceIcon({
  source,
  color,
}: {
  source: 'DATABASE' | 'CUSTOM' | 'COMMUNITY';
  color: string;
}) {
  const iconName =
    source === 'CUSTOM'
      ? 'person-circle-outline'
      : source === 'COMMUNITY'
        ? 'people-outline'
        : 'leaf-outline';
  return <Ionicons name={iconName} size={14} color={color} />;
}

// ---------------------------------------------------------------------------
// Expanded normal card (active)
// ---------------------------------------------------------------------------

function ExpandedNormalCard({
  item,
  colors,
  flashAnims,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  flashAnims: FlashAnims;
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
      <Animated.View
        style={{ transform: [{ scale: flashAnims.quantityScale }], alignSelf: 'flex-start' }}
      >
        <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
          {item.quantity} {item.unit}
        </ThemedText>
      </Animated.View>
      <View style={styles.macroRow}>
        <MacroChip
          label="cal"
          value={item.calories}
          color={colors.caloriesAccent}
          scaleAnim={flashAnims.caloriesScale}
        />
        <MacroChip
          label="P"
          value={item.proteinG}
          color={colors.proteinAccent}
          scaleAnim={flashAnims.proteinScale}
        />
        <MacroChip
          label="C"
          value={item.carbsG}
          color={colors.carbsAccent}
          scaleAnim={flashAnims.carbsScale}
        />
        <MacroChip
          label="F"
          value={item.fatG}
          color={colors.fatAccent}
          scaleAnim={flashAnims.fatScale}
        />
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Compact normal card (collapsed/inactive)
// ---------------------------------------------------------------------------

function CompactNormalCard({
  item,
  colors,
  flashAnims,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  flashAnims: FlashAnims;
}) {
  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.subhead, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <SourceIcon source={item.source} color={colors.textTertiary} />
      </View>
      <Animated.View
        style={{ transform: [{ scale: flashAnims.quantityScale }], alignSelf: 'flex-start' }}
      >
        <ThemedText style={[Typography.caption2, { color: colors.textSecondary }]}>
          {item.quantity} {item.unit}
        </ThemedText>
      </Animated.View>
      <View style={styles.macroRow}>
        <MacroChip
          label="cal"
          value={item.calories}
          color={colors.caloriesAccent}
          scaleAnim={flashAnims.caloriesScale}
        />
        <MacroChip
          label="P"
          value={item.proteinG}
          color={colors.proteinAccent}
          scaleAnim={flashAnims.proteinScale}
        />
        <MacroChip
          label="C"
          value={item.carbsG}
          color={colors.carbsAccent}
          scaleAnim={flashAnims.carbsScale}
        />
        <MacroChip
          label="F"
          value={item.fatG}
          color={colors.fatAccent}
          scaleAnim={flashAnims.fatScale}
        />
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
        <ThemedText style={[Typography.subhead, { color: colors.warning }]}>
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
  onSendTranscript,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
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
              {' '}
              {CREATING_FIELD_LABELS[field]}: {valueStr}
            </ThemedText>
          </View>
        );
      })}

      {/* Current field — inline TextInput + mic dot */}
      {currentField !== 'complete' && currentField !== 'confirm' && (
        <View style={[styles.currentFieldRow, { borderColor: colors.tint }]}>
          <ThemedText style={[Typography.footnote, { color: colors.tint }]}>
            {CREATING_FIELD_LABELS[currentField]}?
          </ThemedText>
          <TextInput
            style={[
              styles.creatingInput,
              {
                color: colors.text,
                borderBottomColor: colors.tint,
              },
            ]}
            placeholder="type or speak"
            placeholderTextColor={colors.textTertiary}
            keyboardType={isNumericField(currentField) ? 'decimal-pad' : 'default'}
            returnKeyType="done"
            onSubmitEditing={(e) => {
              const val = e.nativeEvent.text.trim();
              if (val) onSendTranscript(val);
            }}
            blurOnSubmit={false}
          />
          <View style={[styles.micDot, { backgroundColor: colors.tint }]} />
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Choice card (food not found — waiting for create vs USDA decision)
// ---------------------------------------------------------------------------

function ChoiceCard({
  item,
  colors,
  onSendTranscript,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
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
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
      </View>
      <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
        Not found. Say &quot;create it&quot; or &quot;try USDA&quot;.
      </ThemedText>
      <View style={styles.choiceButtonRow}>
        <Pressable
          onPress={() => onSendTranscript('create it')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.tint, backgroundColor: pressed ? colors.tint : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText
              style={[
                Typography.footnote,
                { color: pressed ? '#fff' : colors.tint, fontWeight: '600' },
              ]}
            >
              Create New
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => onSendTranscript('try USDA')}
          style={({ pressed }) => [
            styles.choiceButton,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceSecondary : 'transparent',
            },
          ]}
        >
          {({ pressed }) => (
            <ThemedText
              style={[
                Typography.footnote,
                { color: pressed ? colors.text : colors.textSecondary, fontWeight: '600' },
              ]}
            >
              Try USDA
            </ThemedText>
          )}
        </Pressable>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// USDA pending card (showing USDA match, awaiting confirm/cancel)
// ---------------------------------------------------------------------------

function UsdaPendingCard({
  item,
  colors,
  onSendTranscript,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
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
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
      </View>
      <ThemedText style={[Typography.caption1, { color: colors.warning }]}>
        USDA — data quality may vary
      </ThemedText>
      <View style={styles.macroRow}>
        <MacroChip label="cal" value={item.calories} color={colors.caloriesAccent} />
        <MacroChip label="P" value={item.proteinG} color={colors.proteinAccent} />
        <MacroChip label="C" value={item.carbsG} color={colors.carbsAccent} />
        <MacroChip label="F" value={item.fatG} color={colors.fatAccent} />
      </View>
      <View style={styles.choiceButtonRow}>
        <Pressable
          onPress={() => onSendTranscript('confirm')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.tint, backgroundColor: pressed ? colors.tint : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText
              style={[
                Typography.footnote,
                { color: pressed ? '#fff' : colors.tint, fontWeight: '600' },
              ]}
            >
              Confirm
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => onSendTranscript('cancel')}
          style={({ pressed }) => [
            styles.choiceButton,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceSecondary : 'transparent',
            },
          ]}
        >
          {({ pressed }) => (
            <ThemedText
              style={[
                Typography.footnote,
                { color: pressed ? colors.text : colors.textSecondary, fontWeight: '600' },
              ]}
            >
              Cancel
            </ThemedText>
          )}
        </Pressable>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DraftMealCardProps {
  item: DraftItem;
  isActive: boolean;
  onSendTranscript: (text: string) => void;
}

export default function DraftMealCard({ item, isActive, onSendTranscript }: DraftMealCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // ---------------------------------------------------------------------------
  // Value flash animations
  // ---------------------------------------------------------------------------

  const quantityScaleAnim = useRef(new Animated.Value(1)).current;
  const caloriesScaleAnim = useRef(new Animated.Value(1)).current;
  const proteinScaleAnim = useRef(new Animated.Value(1)).current;
  const carbsScaleAnim = useRef(new Animated.Value(1)).current;
  const fatScaleAnim = useRef(new Animated.Value(1)).current;

  const prevQuantity = useRef<number | null>(null);
  const prevCalories = useRef<number | null>(null);
  const prevProtein = useRef<number | null>(null);
  const prevCarbs = useRef<number | null>(null);
  const prevFat = useRef<number | null>(null);

  useEffect(() => {
    if (prevQuantity.current !== null && prevQuantity.current !== item.quantity) {
      fireFlash(quantityScaleAnim);
    }
    prevQuantity.current = item.quantity;

    if (prevCalories.current !== null && prevCalories.current !== item.calories) {
      fireFlash(caloriesScaleAnim);
    }
    prevCalories.current = item.calories;

    if (prevProtein.current !== null && prevProtein.current !== item.proteinG) {
      fireFlash(proteinScaleAnim);
    }
    prevProtein.current = item.proteinG;

    if (prevCarbs.current !== null && prevCarbs.current !== item.carbsG) {
      fireFlash(carbsScaleAnim);
    }
    prevCarbs.current = item.carbsG;

    if (prevFat.current !== null && prevFat.current !== item.fatG) {
      fireFlash(fatScaleAnim);
    }
    prevFat.current = item.fatG;
  }, [item.quantity, item.calories, item.proteinG, item.carbsG, item.fatG]);

  const flashAnims: FlashAnims = {
    quantityScale: quantityScaleAnim,
    caloriesScale: caloriesScaleAnim,
    proteinScale: proteinScaleAnim,
    carbsScale: carbsScaleAnim,
    fatScale: fatScaleAnim,
  };

  // ---------------------------------------------------------------------------
  // Pulse animation for clarifying / choice states
  // ---------------------------------------------------------------------------

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (item.state === 'clarifying' || item.state === 'choice') {
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

  // ---------------------------------------------------------------------------
  // Entry animation — slide up + fade in
  // ---------------------------------------------------------------------------

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
        : item.state === 'usda_pending'
          ? colors.warning
          : colors.border;

  const isCompact = !isActive && item.state === 'normal';

  return (
    <Animated.View
      style={[
        isCompact ? styles.cardCompact : styles.card,
        {
          backgroundColor: colors.surface,
          borderColor,
          opacity: Animated.multiply(entryAnim, pulseAnim),
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {item.state === 'normal' && isCompact && (
        <CompactNormalCard item={item} colors={colors} flashAnims={flashAnims} />
      )}
      {item.state === 'normal' && !isCompact && (
        <ExpandedNormalCard item={item} colors={colors} flashAnims={flashAnims} />
      )}
      {item.state === 'clarifying' && <ClarifyingCard item={item} colors={colors} />}
      {item.state === 'creating' && (
        <CreatingCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
      )}
      {item.state === 'choice' && (
        <ChoiceCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
      )}
      {item.state === 'usda_pending' && (
        <UsdaPendingCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
      )}
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
  cardCompact: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
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
    gap: Spacing.sm,
  },
  creatingInput: {
    flex: 1,
    ...Typography.footnote,
    borderBottomWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  micDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  choiceButtonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  choiceButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
});
