import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors, Typography, Spacing, BorderRadius } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { BarcodeScanResult } from "./types";

export type BarcodeResultCardProps = {
  result: BarcodeScanResult;
};

export function BarcodeResultCard({ result }: BarcodeResultCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ThemedText style={[Typography.caption1, { color: colors.textTertiary, marginBottom: Spacing.xs }]}>
        GTIN
      </ThemedText>
      <ThemedText style={[Typography.title3, { color: colors.text, fontFamily: "monospace", marginBottom: Spacing.md }]}>
        {result.gtin}
      </ThemedText>
      <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
        raw: {result.raw}
      </ThemedText>
      <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
        format: {result.format}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    width: "100%",
    maxWidth: 360,
  },
});
