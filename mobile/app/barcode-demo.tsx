import { useRef, useCallback } from "react";
import { useState } from "react";
import { StyleSheet, View, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { ThemedText } from "@/components/themed-text";
import { Colors, Typography, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { normalizeToGTIN } from "@/features/barcode/gtin";
import { scanWithCamera, scanFromImage, getSupportedFeatures } from "@/features/barcode/scanner";
import { normalizeImageForScan } from "@/features/barcode/cropImage";
import { BarcodeCameraScreen } from "@/features/barcode/BarcodeCameraScreen";
import { BarcodeCropView } from "@/features/barcode/BarcodeCropView";
import { BarcodeResultCard } from "@/features/barcode/BarcodeResultCard";
import type { BarcodeScanResult } from "@/features/barcode/types";

type ScanMessage = "no_barcode" | "cancelled" | null;

export default function BarcodeDemoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const router = useRouter();
  const [scanResult, setScanResult] = useState<BarcodeScanResult | null>(null);
  const [scanMessage, setScanMessage] = useState<ScanMessage>(null);
  const [gtinTestResult, setGtinTestResult] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showFallbackCamera, setShowFallbackCamera] = useState(false);
  const [cropPayload, setCropPayload] = useState<{
    uri: string;
    width?: number;
    height?: number;
  } | null>(null);
  const fallbackResolveRef = useRef<((value: BarcodeScanResult | null) => void) | null>(null);

  const clearResult = useCallback(() => {
    setScanResult(null);
    setScanMessage(null);
  }, []);

  const runGtinTest = () => {
    try {
      const r12 = normalizeToGTIN("012345678901");
      const r13 = normalizeToGTIN("0123456789012");
      const empty = normalizeToGTIN("abc");
      let threw = false;
      try {
        normalizeToGTIN("123");
      } catch {
        threw = true;
      }
      setGtinTestResult(
        `12→ ${r12}\n13→ ${r13}\nempty→ "${empty}"\ninvalid throws→ ${threw}`
      );
    } catch (e) {
      setGtinTestResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleScanWithCamera = useCallback(async () => {
    if (Platform.OS === "web") return;
    setScanning(true);
    clearResult();
    try {
      const { isModernBarcodeScannerAvailable } = getSupportedFeatures();
      if (isModernBarcodeScannerAvailable) {
        const result = await scanWithCamera();
        setScanResult(result ?? null);
        setScanMessage(result ? null : "no_barcode");
      } else {
        const result = await new Promise<BarcodeScanResult | null>((resolve) => {
          fallbackResolveRef.current = (value: BarcodeScanResult | null) => {
            fallbackResolveRef.current = null;
            resolve(value);
          };
          setShowFallbackCamera(true);
        });
        setScanResult(result ?? null);
        setScanMessage(result ? null : "cancelled");
      }
    } finally {
      setScanning(false);
      setShowFallbackCamera(false);
    }
  }, [clearResult]);

  const handleFallbackScan = useCallback((result: BarcodeScanResult) => {
    fallbackResolveRef.current?.(result);
  }, []);

  const handleFallbackCancel = useCallback(() => {
    fallbackResolveRef.current?.(null);
  }, []);

  const handleUploadImage = useCallback(async () => {
    clearResult();
    try {
      const isNative = Platform.OS !== "web";
      const { assets, canceled } = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: isNative,
        aspect: isNative ? [4, 1] : undefined,
      });
      if (canceled || !assets?.[0]?.uri) {
        setScanMessage("cancelled");
        return;
      }
      const asset = assets[0];
      if (isNative) {
        setScanning(true);
        await new Promise((r) => setTimeout(r, 100));
        try {
          const uriToScan = await normalizeImageForScan(asset.uri);
          const result = await scanFromImage(uriToScan, {
            type: "image/jpeg",
            name: asset.fileName ?? "image.jpg",
          });
          setScanResult(result ?? null);
          setScanMessage(result ? null : "no_barcode");
        } catch {
          setScanMessage("no_barcode");
        } finally {
          setScanning(false);
        }
      } else {
        setCropPayload({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        });
      }
    } catch {
      setScanMessage("no_barcode");
    }
  }, [clearResult]);

  const handleCropConfirm = useCallback(async (croppedUri: string) => {
    setScanning(true);
    try {
      const result = await scanFromImage(croppedUri, {
        type: "image/jpeg",
        name: "cropped.jpg",
      });
      setScanResult(result ?? null);
      setScanMessage(result ? null : "no_barcode");
    } catch {
      setScanMessage("no_barcode");
    } finally {
      setScanning(false);
      setCropPayload(null);
      if (Platform.OS === "web" && croppedUri.startsWith("blob:")) {
        URL.revokeObjectURL(croppedUri);
      }
    }
  }, []);

  const handleCropCancel = useCallback(() => {
    setCropPayload(null);
  }, []);

  if (showFallbackCamera) {
    return (
      <BarcodeCameraScreen onScan={handleFallbackScan} onCancel={handleFallbackCancel} />
    );
  }

  if (cropPayload != null) {
    return (
      <BarcodeCropView
        imageUri={cropPayload.uri}
        initialDimensions={
          typeof cropPayload.width === "number" &&
          typeof cropPayload.height === "number" &&
          cropPayload.width > 0 &&
          cropPayload.height > 0
            ? { width: cropPayload.width, height: cropPayload.height }
            : undefined
        }
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Barcode demo
        </ThemedText>
        <ThemedText
          style={[Typography.body, { color: colors.textSecondary, textAlign: "center" }]}
        >
          Scan with camera or upload an image to get a GTIN.
        </ThemedText>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={runGtinTest}
        >
          <ThemedText style={styles.buttonText}>Test normalizeToGTIN</ThemedText>
        </TouchableOpacity>
        {gtinTestResult != null && (
          <ThemedText style={[Typography.footnote, { color: colors.text, fontFamily: "monospace" }]}>
            {gtinTestResult}
          </ThemedText>
        )}

        {Platform.OS !== "web" && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={handleScanWithCamera}
            disabled={scanning}
          >
            {scanning && !showFallbackCamera ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonText}>Scan with camera</ThemedText>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleUploadImage}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>Upload image</ThemedText>
          )}
        </TouchableOpacity>

        {scanResult != null && <BarcodeResultCard result={scanResult} />}
        {scanMessage === "no_barcode" && (
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
            No barcode
          </ThemedText>
        )}
        {scanMessage === "cancelled" && (
          <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
            Cancelled
          </ThemedText>
        )}

        <ThemedText
          style={[Typography.footnote, { color: colors.textTertiary, marginTop: Spacing.lg }]}
          onPress={() => router.back()}
        >
          Tap here or use system back to close.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  button: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    marginTop: Spacing.sm,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
