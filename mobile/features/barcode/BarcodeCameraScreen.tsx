import { useRef, useCallback, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Text } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";

import type { BarcodeScanResult } from "./types";
import { normalizeToGTIN } from "./gtin";

const BARCODE_TYPES = ["ean13", "upc_a", "ean8"] as const;
const THROTTLE_MS = 1500;

export type BarcodeCameraScreenProps = {
  onScan: (result: BarcodeScanResult) => void;
  onCancel: () => void;
};

function toBarcodeScanResult(
  data: string,
  format: string
): BarcodeScanResult | null {
  try {
    const gtin = normalizeToGTIN(data, format);
    if (!gtin) return null;
    return { gtin, raw: data, format };
  } catch {
    return null;
  }
}

export function BarcodeCameraScreen({ onScan, onCancel }: BarcodeCameraScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const lastScannedRef = useRef<{ data: string; at: number } | null>(null);

  const handleBarcodeScanned = useCallback(
    (event: BarcodeScanningResult) => {
      const data = event.data ?? (event as { raw?: string }).raw ?? "";
      const format = event.type ?? "unknown";
      const now = Date.now();
      const last = lastScannedRef.current;
      if (last && last.data === data && now - last.at < THROTTLE_MS) {
        return;
      }
      lastScannedRef.current = { data, at: now };

      const result = toBarcodeScanResult(data, format);
      if (result) {
        onScan(result);
      }
    },
    [onScan]
  );

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    await requestPermission();
    setRequesting(false);
  }, [requestPermission]);

  if (permission == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Checking camera permission…</Text>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Camera access is needed to scan barcodes.
        </Text>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleRequestPermission}
          disabled={requesting}
        >
          <Text style={styles.cancelButtonText}>
            {requesting ? "Requesting…" : "Allow camera"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [...BARCODE_TYPES],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.target} />
        <Text style={styles.hint}>Point at barcode.</Text>
      </View>
      <TouchableOpacity
        style={styles.cancelButtonOverlay}
        onPress={onCancel}
        activeOpacity={0.8}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  target: {
    width: 240,
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    backgroundColor: "transparent",
  },
  hint: {
    marginTop: 16,
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
  },
  message: {
    flex: 1,
    padding: 24,
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
  },
  cancelButton: {
    padding: 16,
    alignSelf: "center",
    marginBottom: 24,
  },
  cancelButtonOverlay: {
    position: "absolute",
    bottom: 40,
    left: 24,
    right: 24,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "600",
  },
});
