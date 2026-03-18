import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Typography, Spacing } from '@/constants/theme';
import type { Macros } from '@shared/types';

const DOT = ' · ';

interface MacroInlineLineProps {
  /** Optional prefix e.g. "2 servings" or "100 g" */
  prefix?: string;
  macros: Macros;
  /** Accent colors from theme (caloriesAccent, proteinAccent, etc.) */
  colors: {
    caloriesAccent: string;
    proteinAccent: string;
    carbsAccent: string;
    fatAccent: string;
    textSecondary?: string;
  };
  /** Typography style key for base size */
  textStyle?: keyof typeof Typography;
}

export default function MacroInlineLine({
  prefix,
  macros,
  colors,
  textStyle = 'caption1',
}: MacroInlineLineProps) {
  const base = Typography[textStyle];
  const secondary = colors.textSecondary ?? colors.caloriesAccent;

  return (
    <View style={styles.row}>
      {prefix != null && prefix !== '' && (
        <>
          <ThemedText style={[base, styles.segment, { color: secondary }]}>
            {prefix}
          </ThemedText>
          <ThemedText style={[base, styles.dot]}>{DOT}</ThemedText>
        </>
      )}
      <ThemedText style={[base, styles.segment, styles.bold, { color: colors.caloriesAccent }]}>
        {Math.round(macros.calories)} cal
      </ThemedText>
      <ThemedText style={[base, styles.dot]}>{DOT}</ThemedText>
      <ThemedText style={[base, styles.macroVal, styles.bold, { color: colors.proteinAccent }]}>
        {Math.round(macros.proteinG)}P
      </ThemedText>
      <ThemedText style={[base, styles.macroVal, styles.bold, { color: colors.carbsAccent }]}>
        {Math.round(macros.carbsG)}C
      </ThemedText>
      <ThemedText style={[base, styles.macroVal, styles.bold, { color: colors.fatAccent }]}>
        {Math.round(macros.fatG)}F
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  segment: {
    marginRight: 0,
  },
  dot: {
    marginRight: 0,
    opacity: 0.7,
  },
  macroVal: {
    marginRight: 0,
  },
  bold: {
    fontWeight: '600',
  },
});
