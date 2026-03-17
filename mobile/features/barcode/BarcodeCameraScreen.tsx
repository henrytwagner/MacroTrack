import { useRef, useCallback, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Text, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

import type { BarcodeScanResult } from "./types";
import { normalizeToGTIN } from "./gtin";

const BARCODE_TYPES = ["ean13", "upc_a", "ean8", "upc_e"] as const;
const THROTTLE_MS = 1500;

export type BarcodeCameraScreenProps = {
  onScan: (result: BarcodeScanResult) => void;
  onCancel: () => void;
  defaultFacing?: 'front' | 'back';
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

const DOUBLE_TAP_MS = 400;

export function BarcodeCameraScreen({ onScan, onCancel, defaultFacing = 'front' }: BarcodeCameraScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [requesting, setRequesting] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>(defaultFacing);
  const lastScannedRef = useRef<{ data: string; at: number } | null>(null);
  const lastTapRef = useRef(0);

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

  const handleDoubleTapFlip = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      setFacing((f) => (f === 'front' ? 'back' : 'front'));
    } else {
      lastTapRef.current = now;
    }
  }, []);

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
        facing={facing}
        barcodeScannerSettings={{
          barcodeTypes: [...BARCODE_TYPES],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={handleDoubleTapFlip}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.target} />
        <Text style={styles.hint}>Point at barcode.</Text>
      </View>
      <TouchableOpacity
        style={styles.flipButton}
        onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
        activeOpacity={0.7}
      >
        <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
      </TouchableOpacity>
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
  flipButton: {
    position: "absolute",
    top: 52,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
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
