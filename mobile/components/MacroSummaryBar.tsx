import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDraftStore } from '@/stores/draftStore';
import { useGoalStore } from '@/stores/goalStore';
import { useDateStore } from '@/stores/dateStore';

function fmt(n: number): string {
  return Math.round(n).toString();
}

interface MacroPillProps {
  label: string;
  current: number;
  goal: number | null;
  color: string;
  unit?: string;
}

function MacroPill({ label, current, goal, color, unit = 'g' }: MacroPillProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const remaining = goal !== null ? goal - current : null;
  const isOver = remaining !== null && remaining < 0;

  return (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <ThemedText
        style={[
          Typography.caption1,
          styles.pillLabel,
          { color: colors.textSecondary },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption1,
          styles.pillValue,
          { color: isOver ? colors.destructive : colors.text },
        ]}
      >
        {remaining !== null
          ? isOver
            ? `+${fmt(Math.abs(remaining))}${unit}`
            : `${fmt(remaining)}${unit} left`
          : `${fmt(current)}${unit}`}
      </ThemedText>
    </View>
  );
}

export default function MacroSummaryBar() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const projected = useDraftStore((s) => s.projectedTotals);
  const { selectedDate } = useDateStore();
  const { goalsByDate } = useGoalStore();
  const goals = goalsByDate[selectedDate] ?? null;

  const calRemaining = goals ? goals.calories - projected.calories : null;
  const isCalOver = calRemaining !== null && calRemaining < 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Calorie count — prominent */}
      <View style={styles.calRow}>
        <ThemedText style={[Typography.headline, { color: colors.text }]}>
          {fmt(projected.calories)}
        </ThemedText>
        {goals && (
          <ThemedText style={[Typography.subhead, { color: colors.textSecondary }]}>
            {' / '}{fmt(goals.calories)} cal
          </ThemedText>
        )}
        {!goals && (
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
            {' '}cal logged
          </ThemedText>
        )}
        {calRemaining !== null && (
          <ThemedText
            style={[
              Typography.footnote,
              {
                color: isCalOver ? colors.destructive : colors.textSecondary,
                marginLeft: Spacing.sm,
              },
            ]}
          >
            {isCalOver
              ? `${fmt(Math.abs(calRemaining))} over`
              : `${fmt(calRemaining)} left`}
          </ThemedText>
        )}
      </View>

      {/* Macro pills */}
      <View style={styles.pillsRow}>
        <MacroPill
          label="P"
          current={projected.proteinG}
          goal={goals?.proteinG ?? null}
          color={colors.proteinAccent}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MacroPill
          label="C"
          current={projected.carbsG}
          goal={goals?.carbsG ?? null}
          color={colors.carbsAccent}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MacroPill
          label="F"
          current={projected.fatG}
          goal={goals?.fatG ?? null}
          color={colors.fatAccent}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontWeight: '600',
  },
  pillValue: {
    flexShrink: 1,
  },
  divider: {
    width: 1,
    height: 14,
  },
});
