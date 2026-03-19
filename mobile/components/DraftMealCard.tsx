import { useEffect, useRef, useState } from 'react';
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
import type { ScaleReading } from '@/features/scale/types';

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
  brand: 'Brand',
  barcode: 'Barcode',
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
  source: 'DATABASE' | 'CUSTOM' | 'COMMUNITY' | 'AI_ESTIMATE';
  color: string;
}) {
  const iconName =
    source === 'CUSTOM'
      ? 'person-circle-outline'
      : source === 'COMMUNITY'
        ? 'people-outline'
        : source === 'AI_ESTIMATE'
          ? 'flask-outline'
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
  scaleReading,
  onScaleConfirm,
  onScaleSkip,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  flashAnims: FlashAnims;
  scaleReading?: ScaleReading | null;
  onScaleConfirm?: (quantity: number, unit: string) => void;
  onScaleSkip?: () => void;
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
        <View style={styles.cardHeaderRight}>
          {item.isAssumed && !scaleReading && (
            <ThemedText style={[Typography.caption2, { color: colors.textTertiary }]}>
              ✦assumed
            </ThemedText>
          )}
          <SourceIcon source={item.source} color={colors.textTertiary} />
        </View>
      </View>
      {scaleReading ? (
        <View style={styles.scaleChipRow}>
          <Ionicons name="scale-outline" size={14} color={scaleReading.stable ? colors.tint : colors.textSecondary} />
          <ThemedText style={[Typography.subhead, { color: scaleReading.stable ? colors.tint : colors.textSecondary }]}>
            {' '}{scaleReading.display}
          </ThemedText>
          <ThemedText style={[Typography.caption2, { color: scaleReading.stable ? colors.tint : colors.textTertiary }]}>
            {scaleReading.stable ? ' ● Stable' : ' ○ measuring…'}
          </ThemedText>
          {scaleReading.stable && (
            <View style={styles.scaleButtonRow}>
              <Pressable
                onPress={() => onScaleConfirm?.(scaleReading.value, scaleReading.unit)}
                style={({ pressed }) => [
                  styles.scaleConfirmButton,
                  { borderColor: colors.tint, backgroundColor: pressed ? colors.tint : 'transparent' },
                ]}
              >
                {({ pressed }) => (
                  <ThemedText style={[Typography.caption2, { color: pressed ? '#fff' : colors.tint, fontWeight: '600' }]}>
                    ✓ Confirm
                  </ThemedText>
                )}
              </Pressable>
              <Pressable onPress={onScaleSkip} hitSlop={8}>
                <ThemedText style={[Typography.caption2, { color: colors.textTertiary }]}>
                  Skip
                </ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <Animated.View
          style={{ transform: [{ scale: flashAnims.quantityScale }], alignSelf: 'flex-start' }}
        >
          <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
            {item.quantity} {item.unit}
          </ThemedText>
        </Animated.View>
      )}
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
        <View style={styles.cardHeaderRight}>
          {item.isAssumed && (
            <ThemedText style={[Typography.caption2, { color: colors.textTertiary }]}>
              ✦assumed
            </ThemedText>
          )}
          <SourceIcon source={item.source} color={colors.textTertiary} />
        </View>
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
  'brand',
  'barcode',
];

function CreatingCard({
  item,
  colors,
  onSendTranscript,
  onOpenBarcodeScanner,
  expanded,
  onInteract,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
  onOpenBarcodeScanner?: () => void;
  expanded: boolean;
  onInteract: () => void;
}) {
  const progress = item.creatingProgress;
  const currentField = progress?.currentField ?? 'confirm';
  const currentIdx = CREATION_FIELD_ORDER.indexOf(currentField);

  // Fields that have been filled (before the current one)
  const filledFields = CREATION_FIELD_ORDER.slice(1, currentIdx); // skip "confirm"

  const isSkippable = currentField === 'brand' || currentField === 'barcode';

  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <View style={styles.cardHeaderRight}>
          <Ionicons name="add-circle-outline" size={18} color={colors.tint} />
          {expanded && (
            <Pressable onPress={() => { onInteract(); onSendTranscript('cancel'); }}>
              <Ionicons name="close-circle-outline" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
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
        } else if (field === 'brand') {
          valueStr = progress?.brand ? progress.brand : '(skipped)';
        } else if (field === 'barcode') {
          valueStr = progress?.barcode ? progress.barcode : '(skipped)';
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

      {/* Current field — inline TextInput + mic dot (hidden in minimal mode) */}
      {expanded && currentField !== 'complete' && currentField !== 'confirm' && (
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
              if (val) { onInteract(); onSendTranscript(val); }
            }}
            blurOnSubmit={false}
          />
          {isSkippable && (
            <Pressable
              onPress={() => { onInteract(); onSendTranscript('skip'); }}
              style={styles.skipButton}
            >
              <ThemedText style={[Typography.caption2, { color: colors.textTertiary }]}>
                Skip
              </ThemedText>
            </Pressable>
          )}
          {currentField === 'barcode' && onOpenBarcodeScanner && (
            <Pressable
              onPress={() => { onInteract(); onOpenBarcodeScanner(); }}
              style={[styles.skipButton, { backgroundColor: 'rgba(0,0,0,0.06)' }]}
            >
              <Ionicons name="barcode-outline" size={14} color={colors.tint} />
            </Pressable>
          )}
          <View style={[styles.micDot, { backgroundColor: colors.tint }]} />
        </View>
      )}

      {!expanded && (
        <ThemedText style={[Typography.caption2, { color: colors.textTertiary, textAlign: 'center', marginTop: 4 }]}>
          tap to edit
        </ThemedText>
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
// Phase 2 — Disambiguate card
// ---------------------------------------------------------------------------

function DisambiguateCard({
  item,
  colors,
  onSendTranscript,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
}) {
  const options = item.disambiguationOptions ?? [];
  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <Ionicons name="help-circle-outline" size={18} color={colors.tint} />
      </View>
      <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
        Which one did you mean?
      </ThemedText>
      {options.map((opt, i) => (
        <Pressable
          key={opt.usdaResult.fdcId}
          onPress={() => onSendTranscript(`${i + 1}`)}
          style={({ pressed }) => [
            styles.choiceButton,
            {
              borderColor: colors.tint,
              backgroundColor: pressed ? colors.tint : 'transparent',
              marginTop: i === 0 ? Spacing.xs : 0,
            },
          ]}
        >
          {({ pressed }) => (
            <ThemedText
              style={[
                Typography.footnote,
                { color: pressed ? '#fff' : colors.tint, fontWeight: '600' },
              ]}
              numberOfLines={1}
            >
              {i + 1}. {opt.label}
            </ThemedText>
          )}
        </Pressable>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase 3 — Confirm clear card
// ---------------------------------------------------------------------------

function ConfirmClearCard({
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
          Clear all items?
        </ThemedText>
        <Ionicons name="trash-outline" size={18} color={colors.warning} />
      </View>
      <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
        {item.clarifyQuestion ?? 'Say yes to clear, or cancel to keep.'}
      </ThemedText>
      <View style={styles.choiceButtonRow}>
        <Pressable
          onPress={() => onSendTranscript('yes')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.warning, backgroundColor: pressed ? colors.warning : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? '#fff' : colors.warning, fontWeight: '600' }]}>
              Clear All
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => onSendTranscript('cancel')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? colors.text : colors.textSecondary, fontWeight: '600' }]}>
              Keep
            </ThemedText>
          )}
        </Pressable>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase 3 — Community submit prompt card
// ---------------------------------------------------------------------------

function CommunitySubmitPromptCard({
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
        <Ionicons name="people-outline" size={18} color={colors.tint} />
      </View>
      <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
        {item.clarifyQuestion ?? 'Share this food with the community?'}
      </ThemedText>
      <View style={styles.choiceButtonRow}>
        <Pressable
          onPress={() => onSendTranscript('yes')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.tint, backgroundColor: pressed ? colors.tint : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? '#fff' : colors.tint, fontWeight: '600' }]}>
              Share
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => onSendTranscript('no')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? colors.text : colors.textSecondary, fontWeight: '600' }]}>
              Keep Private
            </ThemedText>
          )}
        </Pressable>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Confirming card — nutrition collected, choose save/share/cancel
// ---------------------------------------------------------------------------

function ConfirmingCard({
  item,
  colors,
  onSendTranscript,
  expanded,
  onInteract,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
  expanded: boolean;
  onInteract: () => void;
}) {
  const progress = item.creatingProgress;
  const confirmingData = item.confirmingData;

  const defaultQty = confirmingData?.quantityMismatch
    ? '1'
    : String(item.initialQuantity ?? 1);
  const defaultUnit = confirmingData?.quantityMismatch
    ? (progress?.servingUnit ?? 'servings')
    : (item.initialUnit ?? progress?.servingUnit ?? 'servings');

  const [qty, setQty] = useState(defaultQty);
  const [unit, setUnit] = useState(defaultUnit);

  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <View style={styles.cardHeaderRight}>
          <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
          <Pressable onPress={() => { onInteract(); onSendTranscript('cancel'); }}>
            <Ionicons name="close-circle-outline" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>

      <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
        Per {progress?.servingSize ?? 1} {progress?.servingUnit ?? 'serving'}
      </ThemedText>

      <View style={styles.macroRow}>
        <MacroChip label="cal" value={progress?.calories ?? 0} color={colors.caloriesAccent} />
        <MacroChip label="P" value={progress?.proteinG ?? 0} color={colors.proteinAccent} />
        <MacroChip label="C" value={progress?.carbsG ?? 0} color={colors.carbsAccent} />
        <MacroChip label="F" value={progress?.fatG ?? 0} color={colors.fatAccent} />
      </View>

      {progress?.brand ? (
        <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
          Brand: {progress.brand}
        </ThemedText>
      ) : null}
      {progress?.barcode ? (
        <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
          Barcode: {progress.barcode}
        </ThemedText>
      ) : null}

      {/* Quantity — always visible */}
      <View style={styles.quantityRow}>
        <ThemedText style={[Typography.footnote, { color: colors.textSecondary, marginRight: 4 }]}>
          Quantity:
        </ThemedText>
        <TextInput
          style={[styles.creatingInput, { color: colors.text, borderBottomColor: colors.tint, flex: 0, minWidth: 48 }]}
          value={qty}
          onChangeText={(v) => { onInteract(); setQty(v); }}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.creatingInput, { color: colors.text, borderBottomColor: colors.tint, flex: 0, minWidth: 72, marginLeft: 6 }]}
          value={unit}
          onChangeText={(v) => { onInteract(); setUnit(v); }}
        />
      </View>

      {confirmingData?.quantityMismatch && (
        <ThemedText style={[Typography.caption2, { color: colors.warning }]}>
          {`⚠ You said '${item.initialQuantity} ${item.initialUnit}' — serving is ${progress?.servingSize ?? 1} ${progress?.servingUnit ?? 'servings'}. Confirm how much you had.`}
        </ThemedText>
      )}

      <View style={styles.choiceButtonRow}>
        <Pressable
          onPress={() => { onInteract(); onSendTranscript(`save to community ${qty} ${unit}`); }}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.tint, backgroundColor: pressed ? colors.tint : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? '#fff' : colors.tint, fontWeight: '600' }]}>
              Share
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => { onInteract(); onSendTranscript(`save privately ${qty} ${unit}`); }}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? colors.text : colors.textSecondary, fontWeight: '600' }]}>
              Save Privately
            </ThemedText>
          )}
        </Pressable>
      </View>

      {!expanded && (
        <ThemedText style={[Typography.caption2, { color: colors.textTertiary, textAlign: 'center', marginTop: 4 }]}>
          tap to edit
        </ThemedText>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase 4 — History results card
// ---------------------------------------------------------------------------

function HistoryResultsCard({
  item,
  colors,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
}) {
  const data = item.historyData;
  if (!data) return null;
  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {data.dateLabel}
        </ThemedText>
        <Ionicons name="calendar-outline" size={18} color={colors.tint} />
      </View>
      {data.addedToDraft && (
        <ThemedText style={[Typography.caption1, { color: colors.tint }]}>
          Added to draft
        </ThemedText>
      )}
      {data.entries.slice(0, 5).map((entry, i) => (
        <ThemedText key={i} style={[Typography.footnote, { color: colors.textSecondary }]} numberOfLines={1}>
          • {entry.name} — {entry.quantity} {entry.unit} ({entry.macros.calories} cal)
        </ThemedText>
      ))}
      {data.entries.length > 5 && (
        <ThemedText style={[Typography.footnote, { color: colors.textTertiary }]}>
          +{data.entries.length - 5} more
        </ThemedText>
      )}
      <View style={styles.macroRow}>
        <MacroChip label="cal" value={data.totals.calories} color={colors.caloriesAccent} />
        <MacroChip label="P" value={data.totals.proteinG} color={colors.proteinAccent} />
        <MacroChip label="C" value={data.totals.carbsG} color={colors.carbsAccent} />
        <MacroChip label="F" value={data.totals.fatG} color={colors.fatAccent} />
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase 5 — Macro summary card
// ---------------------------------------------------------------------------

function MacroSummaryCard({
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
          Today's Progress
        </ThemedText>
        <Ionicons name="analytics-outline" size={18} color={colors.tint} />
      </View>
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
// Phase 5 — Food info card
// ---------------------------------------------------------------------------

function FoodInfoCard({
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
        <Ionicons name="information-circle-outline" size={18} color={colors.tint} />
      </View>
      <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
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
// Phase 5 — Food suggestions card
// ---------------------------------------------------------------------------

function FoodSuggestionsCard({
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
          Suggestions
        </ThemedText>
        <Ionicons name="bulb-outline" size={18} color={colors.tint} />
      </View>
      <ThemedText style={[Typography.caption1, { color: colors.textSecondary }]}>
        Say the food name to add it.
      </ThemedText>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase 6 — AI Estimate card
// ---------------------------------------------------------------------------

function EstimateCard({
  item,
  colors,
  onSendTranscript,
}: {
  item: DraftItem;
  colors: (typeof Colors)['light'];
  onSendTranscript: (text: string) => void;
}) {
  const confidenceColor =
    item.estimateConfidence === 'high'
      ? colors.success
      : item.estimateConfidence === 'low'
        ? colors.warning
        : colors.tint;

  return (
    <>
      <View style={styles.cardHeader}>
        <ThemedText
          style={[Typography.headline, styles.foodName, { color: colors.text }]}
          numberOfLines={1}
        >
          {item.name}
        </ThemedText>
        <View style={styles.estimateBadge}>
          <Ionicons name="warning-outline" size={12} color={colors.warning} />
          <ThemedText style={[Typography.caption2, { color: colors.warning }]}>
            {' '}Est.
          </ThemedText>
        </View>
      </View>
      <ThemedText style={[Typography.caption1, { color: confidenceColor }]}>
        Confidence: {item.estimateConfidence ?? 'medium'}
      </ThemedText>
      <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
        ~{item.quantity} {item.unit}
      </ThemedText>
      <View style={styles.macroRow}>
        <MacroChip label="cal" value={item.calories} color={colors.caloriesAccent} />
        <MacroChip label="P" value={item.proteinG} color={colors.proteinAccent} />
        <MacroChip label="C" value={item.carbsG} color={colors.carbsAccent} />
        <MacroChip label="F" value={item.fatG} color={colors.fatAccent} />
      </View>
      <View style={styles.choiceButtonRow}>
        <Pressable
          onPress={() => onSendTranscript('add')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.warning, backgroundColor: pressed ? colors.warning : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? '#fff' : colors.warning, fontWeight: '600' }]}>
              Add anyway
            </ThemedText>
          )}
        </Pressable>
        <Pressable
          onPress={() => onSendTranscript('search DB')}
          style={({ pressed }) => [
            styles.choiceButton,
            { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceSecondary : 'transparent' },
          ]}
        >
          {({ pressed }) => (
            <ThemedText style={[Typography.footnote, { color: pressed ? colors.text : colors.textSecondary, fontWeight: '600' }]}>
              Search DB
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
  onOpenBarcodeScanner?: () => void;
  scaleReading?: ScaleReading | null;
  onScaleConfirm?: (quantity: number, unit: string) => void;
  onScaleSkip?: () => void;
}

export default function DraftMealCard({ item, isActive, onSendTranscript, onOpenBarcodeScanner, scaleReading, onScaleConfirm, onScaleSkip }: DraftMealCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // ---------------------------------------------------------------------------
  // Progressive disclosure — tap to expand, auto-collapse after 3s
  // ---------------------------------------------------------------------------

  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetCollapseTimer = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 3000);
  };

  const handleExpand = () => {
    setExpanded(true);
    resetCollapseTimer();
  };

  const handleCardPress = () => {
    if (!expanded) handleExpand();
    else resetCollapseTimer();
  };

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

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
    if (item.state === 'clarifying' || item.state === 'choice' || item.state === 'disambiguate') {
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
        : item.state === 'confirming'
          ? colors.success
          : item.state === 'usda_pending'
            ? colors.warning
            : item.state === 'disambiguate'
              ? colors.tint
              : item.state === 'confirm_clear'
                ? colors.warning
                : item.state === 'community_submit_prompt'
                  ? colors.tint
                  : item.state === 'estimate_card'
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
      <Pressable onPress={handleCardPress}>
        {item.state === 'normal' && isCompact && (
          <CompactNormalCard item={item} colors={colors} flashAnims={flashAnims} />
        )}
        {item.state === 'normal' && !isCompact && (
          <ExpandedNormalCard
            item={item}
            colors={colors}
            flashAnims={flashAnims}
            scaleReading={scaleReading}
            onScaleConfirm={onScaleConfirm}
            onScaleSkip={onScaleSkip}
          />
        )}
        {item.state === 'clarifying' && <ClarifyingCard item={item} colors={colors} />}
        {item.state === 'creating' && (
          <CreatingCard
            item={item}
            colors={colors}
            onSendTranscript={onSendTranscript}
            onOpenBarcodeScanner={onOpenBarcodeScanner}
            expanded={expanded}
            onInteract={resetCollapseTimer}
          />
        )}
        {item.state === 'confirming' && (
          <ConfirmingCard
            item={item}
            colors={colors}
            onSendTranscript={onSendTranscript}
            expanded={expanded}
            onInteract={resetCollapseTimer}
          />
        )}
        {item.state === 'choice' && (
          <ChoiceCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
        {item.state === 'usda_pending' && (
          <UsdaPendingCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
        {item.state === 'disambiguate' && (
          <DisambiguateCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
        {item.state === 'confirm_clear' && (
          <ConfirmClearCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
        {item.state === 'community_submit_prompt' && (
          <CommunitySubmitPromptCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
        {item.state === 'history_results' && (
          <HistoryResultsCard item={item} colors={colors} />
        )}
        {item.state === 'macro_summary' && (
          <MacroSummaryCard item={item} colors={colors} />
        )}
        {item.state === 'food_info' && (
          <FoodInfoCard item={item} colors={colors} />
        )}
        {item.state === 'food_suggestions' && (
          <FoodSuggestionsCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
        {item.state === 'estimate_card' && (
          <EstimateCard item={item} colors={colors} onSendTranscript={onSendTranscript} />
        )}
      </Pressable>
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
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  estimateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,165,0,0.12)',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  skipButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(128,128,128,0.1)',
    flexShrink: 0,
  },
  scaleChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  scaleButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginLeft: 4,
  },
  scaleConfirmButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
});
