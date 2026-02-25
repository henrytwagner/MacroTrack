import { useRef, useCallback } from "react";
import { useState } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Platform,
  TextInput,
  Keyboard,
  InputAccessoryView,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { ThemedText } from "@/components/themed-text";
import { Colors, Typography, Spacing } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { validateGTINInput, inferFormatFromLength } from "@/features/barcode/gtin";
import { scanWithCamera, scanFromImage, getSupportedFeatures } from "@/features/barcode/scanner";
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
  const [scanning, setScanning] = useState(false);
  const [showFallbackCamera, setShowFallbackCamera] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualInput, setManualInput] = useState("");
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
      const { assets, canceled } = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
      });
      if (canceled || !assets?.[0]?.uri) {
        setScanMessage("cancelled");
        return;
      }
      const asset = assets[0];
      setCropPayload({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
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

  const handleEnterBarcodePress = useCallback(() => {
    clearResult();
    setManualInput("");
    setShowManualEntry(true);
  }, [clearResult]);

  const handleManualCancel = useCallback(() => {
    Keyboard.dismiss();
    setShowManualEntry(false);
    setManualInput("");
  }, []);

  const handleManualSubmit = useCallback(() => {
    Keyboard.dismiss();
    const validation = validateGTINInput(manualInput);
    if (!validation.valid) return;
    const digits = manualInput.replace(/\D/g, "");
    const format = inferFormatFromLength(digits.length);
    setScanResult({
      gtin: validation.gtin,
      raw: validation.gtin,
      format,
    });
    setShowManualEntry(false);
    setManualInput("");
  }, [manualInput]);

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
      <TouchableWithoutFeedback
        onPress={() => {
          if (!showManualEntry) Keyboard.dismiss();
        }}
        accessible={false}
      >
        {(() => {
          const ContentWrapper =
            showManualEntry && Platform.OS !== "web" ? KeyboardAvoidingView : View;
          const wrapperProps =
            showManualEntry && Platform.OS !== "web"
              ? {
                  behavior: "padding" as const,
                  keyboardVerticalOffset: Platform.OS === "ios" ? 44 : 0,
                }
              : {};
          return (
            <ContentWrapper style={styles.content} {...wrapperProps}>
        <ThemedText type="title" style={styles.title}>
          Barcode demo
        </ThemedText>
        <ThemedText
          style={[Typography.body, { color: colors.textSecondary, textAlign: "center" }]}
        >
          Scan with camera, upload an image, or enter a barcode number to look up a product.
        </ThemedText>

        {showManualEntry && Platform.OS === "ios" && (() => {
          const accessoryValidation = validateGTINInput(manualInput);
          return (
            <InputAccessoryView nativeID="manualBarcodeAccessory">
              <View
                style={[
                  styles.inputAccessoryBar,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={[styles.inputAccessoryButton, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={handleManualCancel}
                >
                  <ThemedText style={[styles.buttonText, { color: colors.text }]}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.inputAccessoryButton,
                    {
                      backgroundColor: accessoryValidation.valid ? colors.tint : colors.surfaceSecondary,
                    },
                  ]}
                  onPress={handleManualSubmit}
                  disabled={!accessoryValidation.valid}
                >
                  <ThemedText
                    style={[
                      styles.buttonText,
                      { color: accessoryValidation.valid ? "#fff" : colors.textTertiary },
                    ]}
                  >
                    Submit
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </InputAccessoryView>
          );
        })()}

        {showManualEntry ? (() => {
          const manualValidation = validateGTINInput(manualInput);
          const isInvalid = manualInput.length > 0 && !manualValidation.valid;
          const manualEntryContent = (
            <>
              <TextInput
                style={[
                  styles.manualInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isInvalid ? colors.destructive : colors.border,
                    color: colors.text,
                  },
                ]}
                value={manualInput}
                onChangeText={(text) => setManualInput(text.replace(/\D/g, ""))}
                placeholder="8, 12, or 13 digits"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={handleManualSubmit}
                inputAccessoryViewID={Platform.OS === "ios" ? "manualBarcodeAccessory" : undefined}
                maxLength={20}
                autoFocus
              />
              <ThemedText
                style={[
                  Typography.caption1,
                  { color: isInvalid ? colors.destructive : colors.textTertiary },
                ]}
              >
                {manualInput.length === 0
                  ? "8, 12, or 13 digits"
                  : manualValidation.valid
                    ? "Valid"
                    : manualValidation.error}
              </ThemedText>
              {Platform.OS !== "ios" && (
                <View style={styles.manualEntryActions}>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: colors.surfaceSecondary }]}
                    onPress={handleManualCancel}
                  >
                    <ThemedText style={[styles.buttonText, { color: colors.text }]}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      {
                        backgroundColor: manualValidation.valid
                          ? colors.tint
                          : colors.surfaceSecondary,
                      },
                    ]}
                    onPress={handleManualSubmit}
                    disabled={!manualValidation.valid}
                  >
                    <ThemedText
                      style={[
                        styles.buttonText,
                        { color: manualValidation.valid ? "#fff" : colors.textTertiary },
                      ]}
                    >
                      Submit
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </>
          );
          return (
            <View style={styles.manualEntryBlock}>
              {Platform.OS === "android" ? (
                <KeyboardAvoidingView
                  behavior="padding"
                  style={styles.keyboardAvoiding}
                  keyboardVerticalOffset={0}
                >
                  {manualEntryContent}
                </KeyboardAvoidingView>
              ) : (
                manualEntryContent
              )}
            </View>
          );
        })() : (
          <>
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

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.tint }]}
              onPress={handleEnterBarcodePress}
              disabled={scanning}
            >
              <ThemedText style={styles.buttonText}>Enter barcode number</ThemedText>
            </TouchableOpacity>
          </>
        )}

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
            </ContentWrapper>
          );
        })()}
      </TouchableWithoutFeedback>
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
  manualEntryBlock: {
    width: "100%",
    maxWidth: 360,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  keyboardAvoiding: {
    width: "100%",
  },
  manualInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  manualEntryActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  inputAccessoryBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  inputAccessoryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
});
