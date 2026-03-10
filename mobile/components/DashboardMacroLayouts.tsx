import { useCallback, useMemo, useState } from 'react';
import {
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  View,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MacroProgressBar from '@/components/MacroProgressBar';
import type { Macros } from '@shared/types';

export type MacroLayoutId =
  | 'bars'
  | 'nested-rings'
  | 'activity-rings';

const LAYOUT_IDS: MacroLayoutId[] = [
  'bars',
  'nested-rings',
  'activity-rings',
];

const LAYOUT_LABELS: Record<MacroLayoutId, string> = {
  bars: 'Bars',
  'nested-rings': 'Nested',
  'activity-rings': 'Activity',
};

function getOverflowColor(baseColor: string): string {
  if (!baseColor?.startsWith('#') || baseColor.length !== 7) return baseColor;
  const r = Math.round(parseInt(baseColor.slice(1, 3), 16) * 0.75);
  const g = Math.round(parseInt(baseColor.slice(3, 5), 16) * 0.75);
  const b = Math.round(parseInt(baseColor.slice(5, 7), 16) * 0.75);
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Single ring for custom layouts (nested, hierarchy)
function SingleRing({
  size,
  strokeWidth,
  current,
  goal,
  accentColor,
  trackColor,
  label,
  centerText,
  centerTextStyle,
  labelStyle,
}: {
  size: number;
  strokeWidth: number;
  current: number;
  goal: number;
  accentColor: string;
  trackColor: string;
  label?: string;
  centerText?: string;
  centerTextStyle?: object;
  labelStyle?: object;
}) {
  const r = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;
  const progress = goal > 0 ? Math.min(current / goal, 1.2) : 0;
  const fillLength = Math.min(progress, 1) * circumference;
  const overflowLength = progress > 1 ? (progress - 1) * circumference : 0;
  const overflowColor = getOverflowColor(accentColor);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={[localStyles.singleRingWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        {fillLength > 0 && (
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={accentColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${fillLength} ${circumference - fillLength}`}
            strokeLinecap="round"
          />
        )}
        {overflowLength > 0 && (
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={overflowColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${overflowLength} ${circumference - overflowLength}`}
            strokeDashoffset={-fillLength}
            strokeLinecap="round"
          />
        )}
      </Svg>
      {(centerText !== undefined || label !== undefined) && (
        <View style={[localStyles.ringCenter, StyleSheet.absoluteFillObject]}>
          {centerText !== undefined && (
            <ThemedText style={[Typography.caption2, localStyles.ringCenterText, centerTextStyle]} numberOfLines={1}>
              {centerText}
            </ThemedText>
          )}
          {label !== undefined && centerText === undefined && (
            <ThemedText style={[Typography.caption2, localStyles.ringCenterText, labelStyle]} numberOfLines={1}>
              {label}
            </ThemedText>
          )}
        </View>
      )}
    </View>
  );
}

// 1. Bars only (fixed square-ish card, bars constrained to avoid overflow)
function LayoutBars({
  totals,
  goals,
  colors,
}: {
  totals: Macros;
  goals: Macros;
  colors: Record<string, string>;
}) {
  return (
    <View style={[localStyles.layoutPad, localStyles.layoutConstrained]}>
      <View style={localStyles.barsContainer}>
        <MacroProgressBar
          label="Calories"
          current={totals.calories}
          goal={goals.calories}
          accentColor={colors.caloriesAccent}
          unit=" cal"
        />
        <MacroProgressBar
          label="Protein"
          current={totals.proteinG}
          goal={goals.proteinG}
          accentColor={colors.proteinAccent}
          unit="g"
        />
        <MacroProgressBar
          label="Carbs"
          current={totals.carbsG}
          goal={goals.carbsG}
          accentColor={colors.carbsAccent}
          unit="g"
        />
        <MacroProgressBar
          label="Fat"
          current={totals.fatG}
          goal={goals.fatG}
          accentColor={colors.fatAccent}
          unit="g"
        />
      </View>
    </View>
  );
}

// 2. Nested: one big calorie ring with text stats to the right, three rings below
function LayoutNestedRings({
  totals,
  goals,
  colors,
}: {
  totals: Macros;
  goals: Macros;
  colors: Record<string, string>;
}) {
  const big = 128;
  const small = 72;
  const swBig = 11;
  const swSmall = 6;
  const calProgress =
    goals.calories > 0
      ? `${Math.round(totals.calories)} / ${goals.calories}`
      : `${Math.round(totals.calories)}`;
  const stats = [
    { label: 'Calories', current: Math.round(totals.calories), goal: goals.calories, unit: ' cal' },
    { label: 'Protein', current: Math.round(totals.proteinG), goal: goals.proteinG, unit: 'g' },
    { label: 'Carbs', current: Math.round(totals.carbsG), goal: goals.carbsG, unit: 'g' },
    { label: 'Fat', current: Math.round(totals.fatG), goal: goals.fatG, unit: 'g' },
  ];
  const macroData = [
    { label: 'Protein', current: totals.proteinG, goal: goals.proteinG, unit: 'g', color: colors.proteinAccent },
    { label: 'Carbs', current: totals.carbsG, goal: goals.carbsG, unit: 'g', color: colors.carbsAccent },
    { label: 'Fat', current: totals.fatG, goal: goals.fatG, unit: 'g', color: colors.fatAccent },
  ];
  return (
    <View style={[localStyles.layoutPad, localStyles.layoutConstrained]}>
      <View style={localStyles.layoutContentWrap}>
        <View style={localStyles.nestedTop}>
          <SingleRing
            size={big}
            strokeWidth={swBig}
            current={totals.calories}
            goal={goals.calories}
            accentColor={colors.caloriesAccent}
            trackColor={colors.progressTrack}
            centerText={calProgress}
            centerTextStyle={[Typography.callout, { fontWeight: '700', color: colors.text }]}
          />
          <View style={localStyles.nestedStats}>
            {stats.map((s) => (
              <View key={s.label} style={localStyles.nestedStatRow}>
                <ThemedText style={[Typography.caption2, { color: colors.textSecondary }]}>
                  {s.label}
                </ThemedText>
                <ThemedText style={[Typography.subhead, { color: colors.text, fontWeight: '600' }]}>
                  {s.goal > 0 ? `${s.current} / ${s.goal}${s.unit}`.trim() : `${s.current}${s.unit}`}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
        <View style={localStyles.nestedRow}>
          {macroData.map((m) => (
            <View key={m.label} style={localStyles.nestedRingWithData}>
              <SingleRing
                size={small}
                strokeWidth={swSmall}
                current={m.current}
                goal={m.goal}
                accentColor={m.color}
                trackColor={colors.progressTrack}
              />
              <ThemedText style={[Typography.subhead, { color: colors.textSecondary, fontWeight: '600' }]}>
                {m.label}
              </ThemedText>
              <ThemedText style={[Typography.callout, { color: colors.text, fontWeight: '700' }]}>
                {Math.round(m.current)} / {m.goal}{m.unit}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// 3. Activity rings: concentric circles — bold, right-aligned; stats left with label above value
function LayoutActivityRings({
  totals,
  goals,
  colors,
}: {
  totals: Macros;
  goals: Macros;
  colors: Record<string, string>;
}) {
  const size = 176;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 14;
  const ringGap = 3;
  // Radii from outer to inner: each ring is (r - strokeWidth/2) for the circle center
  const rings = useMemo(() => {
    const accentColors = [
      colors.caloriesAccent,
      colors.proteinAccent,
      colors.carbsAccent,
      colors.fatAccent,
    ];
    const keys = ['calories', 'proteinG', 'carbsG', 'fatG'] as const;
    let r = size / 2 - strokeWidth / 2;
    return keys.map((key, i) => {
      const current = key === 'calories' ? totals.calories : totals[key];
      const goal = key === 'calories' ? goals.calories : goals[key];
      const progress = goal > 0 ? Math.min(current / goal, 1.2) : 0;
      const fillLen = Math.min(progress, 1) * (2 * Math.PI * r);
      const overflowLen = progress > 1 ? (progress - 1) * (2 * Math.PI * r) : 0;
      const circ = 2 * Math.PI * r;
      const result = {
        r,
        progress,
        fillLen,
        overflowLen,
        circ,
        color: accentColors[i],
        overflowColor: getOverflowColor(accentColors[i]),
      };
      r -= strokeWidth + ringGap;
      return result;
    });
  }, [totals, goals, colors, size]);

  const activityStats = [
    { label: 'Cal', current: Math.round(totals.calories), goal: goals.calories, unit: '' },
    { label: 'P', current: Math.round(totals.proteinG), goal: goals.proteinG, unit: 'g' },
    { label: 'C', current: Math.round(totals.carbsG), goal: goals.carbsG, unit: 'g' },
    { label: 'F', current: Math.round(totals.fatG), goal: goals.fatG, unit: 'g' },
  ];

  return (
    <View style={[localStyles.layoutPad, localStyles.layoutConstrained]}>
      <View style={localStyles.layoutContentWrap}>
        <View style={localStyles.activityTop}>
          <View style={[localStyles.singleRingWrap, { width: size, height: size }]}>
            <Svg width={size} height={size}>
              {rings.map((ring, i) => (
                <G key={i}>
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={ring.r}
                    stroke={colors.progressTrack}
                    strokeWidth={strokeWidth}
                    fill="none"
                  />
                  {ring.fillLen > 0 && (
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={ring.r}
                      stroke={ring.color}
                      strokeWidth={strokeWidth}
                      fill="none"
                      strokeDasharray={`${ring.fillLen} ${ring.circ - ring.fillLen}`}
                      strokeLinecap="round"
                    />
                  )}
                  {ring.overflowLen > 0 && (
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={ring.r}
                      stroke={ring.overflowColor}
                      strokeWidth={strokeWidth}
                      fill="none"
                      strokeDasharray={`${ring.overflowLen} ${ring.circ - ring.overflowLen}`}
                      strokeDashoffset={-ring.fillLen}
                      strokeLinecap="round"
                    />
                  )}
                </G>
              ))}
            </Svg>
          </View>
          <View style={localStyles.activityStats}>
            {activityStats.map((s) => (
              <View key={s.label} style={localStyles.activityStatBlock}>
                <ThemedText
                  style={[localStyles.activityStatLabel, { color: colors.textTertiary }]}
                >
                  {s.label}
                </ThemedText>
                <ThemedText
                  style={[localStyles.activityStatValue, { color: colors.text }]}
                >
                  {s.goal > 0 ? `${s.current}/${s.goal}${s.unit}` : `${s.current}${s.unit}`}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// --- Carousel ---

export interface DashboardMacroCarouselProps {
  totals: Macros;
  goals: Macros | null;
}

/** Single layout for dashboard (explicit bounds, no carousel). Use with a fixed-width container. */
export interface DashboardMacroSingleLayoutProps {
  layoutId: MacroLayoutId;
  totals: Macros;
  goals: Macros | null;
}

export function DashboardMacroSingleLayout({ layoutId, totals, goals }: DashboardMacroSingleLayoutProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const hasGoals = goals !== null;

  if (!hasGoals) {
    return (
      <View style={[localStyles.layoutPad, localStyles.placeholder]}>
        <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
          Set goals to see progress
        </ThemedText>
      </View>
    );
  }
  const g = goals!;
  switch (layoutId) {
    case 'bars':
      return <LayoutBars totals={totals} goals={g} colors={colors} />;
    case 'nested-rings':
      return <LayoutNestedRings totals={totals} goals={g} colors={colors} />;
    case 'activity-rings':
      return <LayoutActivityRings totals={totals} goals={g} colors={colors} />;
    default:
      return <LayoutBars totals={totals} goals={g} colors={colors} />;
  }
}

const GAP = Spacing.sm;

export function DashboardMacroCarousel({ totals, goals }: DashboardMacroCarouselProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { width } = useWindowDimensions();
  const cardWidth = width - Spacing.lg * 2;
  const hasGoals = goals !== null;
  const [pageIndex, setPageIndex] = useState(0);

  // Exactly 3 snap positions so scroll locks to three panes
  const snapToOffsets = [0, cardWidth + GAP, 2 * (cardWidth + GAP)];
  const contentWidth = Spacing.lg * 2 + 3 * cardWidth + 2 * GAP;

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / (cardWidth + GAP));
    setPageIndex(Math.max(0, Math.min(index, LAYOUT_IDS.length - 1)));
  }, [cardWidth]);

  const renderLayout = (layoutId: MacroLayoutId) => {
    if (!hasGoals) {
      return (
        <View style={[localStyles.layoutPad, localStyles.placeholder]}>
          <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
            Set goals to see progress
          </ThemedText>
        </View>
      );
    }
    const g = goals!;
    switch (layoutId) {
      case 'bars':
        return <LayoutBars totals={totals} goals={g} colors={colors} />;
      case 'nested-rings':
        return <LayoutNestedRings totals={totals} goals={g} colors={colors} />;
      case 'activity-rings':
        return <LayoutActivityRings totals={totals} goals={g} colors={colors} />;
      default:
        return <LayoutBars totals={totals} goals={g} colors={colors} />;
    }
  };

  return (
    <View style={localStyles.carouselWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        snapToOffsets={snapToOffsets}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={[localStyles.carouselContent, { width: contentWidth }]}
        style={localStyles.carousel}
      >
        {LAYOUT_IDS.map((id) => (
          <View key={id} style={[localStyles.carouselCard, { width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth }]}>
            <View style={[localStyles.carouselCardInner, { width: cardWidth }]}>
              {renderLayout(id)}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={localStyles.dotsRow}>
        {LAYOUT_IDS.map((id, i) => (
          <View
            key={id}
            style={[
              localStyles.dot,
              {
                backgroundColor: colors.textTertiary,
                opacity: i === pageIndex ? 1 : 0.4,
                transform: [{ scale: i === pageIndex ? 1.2 : 1 }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  carouselWrap: {
    marginHorizontal: -Spacing.lg,
  },
  carousel: {
    flexGrow: 0,
  },
  carouselContent: {
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  carouselCard: {
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  carouselCardInner: {
    flex: 1,
    overflow: 'hidden',
    paddingVertical: Spacing.xs,
  },
  layoutConstrained: {
    maxWidth: '100%',
    overflow: 'hidden',
  },
  layoutContentWrap: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.5,
  },
  layoutPad: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    width: '100%',
    minWidth: 0,
  },
  placeholder: {
    justifyContent: 'center',
  },
  barsContainer: {
    gap: Spacing.md,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  singleRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenterText: {
    textAlign: 'center',
  },
  nestedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
    flexWrap: 'wrap',
  },
  nestedStats: {
    gap: Spacing.xs,
    minWidth: 0,
  },
  nestedStatRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  nestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    maxWidth: '100%',
    flexWrap: 'wrap',
  },
  nestedRingWithData: {
    alignItems: 'center',
    gap: 6,
  },
  activityLegend: {
    marginTop: Spacing.md,
  },
  activityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    width: '100%',
  },
  activityStats: {
    gap: Spacing.sm,
    minWidth: 0,
    marginRight: Spacing.lg,
  },
  activityStatBlock: {
    gap: 0,
  },
  activityStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  activityStatValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 18,
  },
});

export { LAYOUT_IDS, LAYOUT_LABELS };
