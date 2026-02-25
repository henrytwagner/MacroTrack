import { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Text,
  Platform,
  Dimensions,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import { cropImageToRegion } from "./cropImage";
import type { CropRegion } from "./cropImage";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/** Fallback container size so we don't stall on "Loading…" when onLayout is delayed (e.g. web). */
const FALLBACK_CONTAINER = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

// Viewfinder as fraction of container: 80% width, 25% height, centered (native)
const VIEWFINDER_WIDTH_RATIO = 0.8;
const VIEWFINDER_HEIGHT_RATIO = 0.25;
const VIEWFINDER_LEFT_RATIO = (1 - VIEWFINDER_WIDTH_RATIO) / 2;
const VIEWFINDER_TOP_RATIO = (1 - VIEWFINDER_HEIGHT_RATIO) / 2;

// Web: fixed pixel viewfinder so it doesn't scale with window
const VIEWFINDER_FIXED_WIDTH_WEB = 320;
const VIEWFINDER_FIXED_HEIGHT_WEB = 80;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

function getViewfinderRect(containerWidth: number, containerHeight: number): { vx: number; vy: number; vw: number; vh: number } {
  if (Platform.OS === "web") {
    const vw = VIEWFINDER_FIXED_WIDTH_WEB;
    const vh = VIEWFINDER_FIXED_HEIGHT_WEB;
    return {
      vx: (containerWidth - vw) / 2,
      vy: (containerHeight - vh) / 2,
      vw,
      vh,
    };
  }
  return {
    vx: containerWidth * VIEWFINDER_LEFT_RATIO,
    vy: containerHeight * VIEWFINDER_TOP_RATIO,
    vw: containerWidth * VIEWFINDER_WIDTH_RATIO,
    vh: containerHeight * VIEWFINDER_HEIGHT_RATIO,
  };
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export type BarcodeCropViewProps = {
  imageUri: string;
  /** When provided (e.g. from the picker asset), avoids async Image.getSize which can fail on iOS. */
  initialDimensions?: { width: number; height: number };
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
};

async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      if (uri.startsWith("http://") || uri.startsWith("https://")) {
        img.crossOrigin = "anonymous";
      }
      const timeout = setTimeout(() => {
        reject(new Error("Image load timed out"));
      }, 15000);
      img.onload = () => {
        clearTimeout(timeout);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to load image"));
      };
      img.src = uri;
    });
  }
  // On iOS, Image.getSize often never resolves for photo-library URIs. Use
  // expo-image-manipulator to load the image and read dimensions (no crop/save).
  const { ImageManipulator } = require("expo-image-manipulator");
  const imageRef = await ImageManipulator.manipulate(uri).renderAsync();
  return { width: imageRef.width, height: imageRef.height };
}

export function BarcodeCropView({
  imageUri,
  initialDimensions,
  onConfirm,
  onCancel,
}: BarcodeCropViewProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(initialDimensions ?? null);
  const [containerLayout, setContainerLayout] = useState<{
    width: number;
    height: number;
  } | null>(() => (Platform.OS === "web" ? FALLBACK_CONTAINER : null));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    if (initialDimensions) {
      setImageDimensions(initialDimensions);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    getImageDimensions(imageUri)
      .then((dims) => {
        if (!cancelled) setImageDimensions(dims);
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load image");
      });
    return () => {
      cancelled = true;
    };
  }, [imageUri, initialDimensions]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * WHEEL_ZOOM_SENSITIVITY;
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, savedScale.value + delta)
      );
      scale.value = newScale;
      savedScale.value = newScale;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerLayout, imageDimensions]);

  const onContainerLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerLayout({ width, height });
    }
  }, []);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, savedScale.value * e.scale)
      );
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const computeCropRegion = useCallback((): CropRegion | null => {
    if (!imageDimensions || !containerLayout) return null;
    const { width: iw, height: ih } = imageDimensions;
    const { width: cw, height: ch } = containerLayout;
    const sFit = Math.min(cw / iw, ch / ih);
    const ox = (cw - iw * sFit) / 2;
    const oy = (ch - ih * sFit) / 2;

    const s = sFit * scale.value;
    const imageLeft = ox + translateX.value + (iw * sFit * (1 - scale.value)) / 2;
    const imageTop = oy + translateY.value + (ih * sFit * (1 - scale.value)) / 2;

    const { vx, vy, vw, vh } = getViewfinderRect(cw, ch);

    let originX = (vx - imageLeft) / s;
    let originY = (vy - imageTop) / s;
    let width = vw / s;
    let height = vh / s;

    originX = Math.max(0, Math.min(originX, iw - 1));
    originY = Math.max(0, Math.min(originY, ih - 1));
    const maxW = iw - originX;
    const maxH = ih - originY;
    width = Math.max(1, Math.min(width, maxW));
    height = Math.max(1, Math.min(height, maxH));

    return { originX, originY, width, height };
  }, [imageDimensions, containerLayout, scale, translateX, translateY]);

  const handleScan = useCallback(async () => {
    const region = computeCropRegion();
    if (!region) return;
    setIsCropping(true);
    try {
      const croppedUri = await cropImageToRegion(imageUri, region);
      onConfirm(croppedUri);
    } catch {
      setLoadError("Crop failed");
    } finally {
      setIsCropping(false);
    }
  }, [imageUri, computeCropRegion, onConfirm]);

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.destructive }]}>
          {loadError}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={onCancel}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!imageDimensions || !containerLayout) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          Loading…
        </Text>
      </View>
    );
  }

  const { width: iw, height: ih } = imageDimensions;
  const { width: cw, height: ch } = containerLayout;
  const sFit = Math.min(cw / iw, ch / ih);
  const displayWidth = iw * sFit;
  const displayHeight = ih * sFit;
  const ox = (cw - displayWidth) / 2;
  const oy = (ch - displayHeight) / 2;

  const { vx, vy, vw, vh } = getViewfinderRect(cw, ch);

  return (
    <View
      ref={containerRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      onLayout={onContainerLayout}
    >
      <GestureDetector gesture={composed}>
        <View style={styles.imageContainer}>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: ox,
                top: oy,
                width: displayWidth,
                height: displayHeight,
              },
              imageAnimatedStyle,
            ]}
          >
            <Image
              source={{ uri: imageUri }}
              style={{ width: displayWidth, height: displayHeight }}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={[
            styles.overlayRect,
            {
              left: 0,
              top: 0,
              width: cw,
              height: vy,
              backgroundColor: colors.overlay ?? "rgba(0,0,0,0.5)",
            },
          ]}
        />
        <View
          style={[
            styles.overlayRect,
            {
              left: 0,
              top: vy,
              width: vx,
              height: vh,
              backgroundColor: colors.overlay ?? "rgba(0,0,0,0.5)",
            },
          ]}
        />
        <View
          style={[
            styles.overlayRect,
            {
              left: vx + vw,
              top: vy,
              width: cw - (vx + vw),
              height: vh,
              backgroundColor: colors.overlay ?? "rgba(0,0,0,0.5)",
            },
          ]}
        />
        <View
          style={[
            styles.overlayRect,
            {
              left: 0,
              top: vy + vh,
              width: cw,
              height: ch - (vy + vh),
              backgroundColor: colors.overlay ?? "rgba(0,0,0,0.5)",
            },
          ]}
        />
        <View
          style={[
            styles.viewfinderBorder,
            {
              left: vx,
              top: vy,
              width: vw,
              height: vh,
              borderColor: colors.surface,
            },
          ]}
        />
      </View>

      <Text
        style={[styles.instruction, { color: colors.textSecondary }]}
        pointerEvents="none"
      >
        Position the barcode inside the frame
      </Text>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.destructive }]}
          onPress={onCancel}
          disabled={isCropping}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleScan}
          disabled={isCropping}
        >
          <Text style={styles.buttonText}>
            {isCropping ? "Scanning…" : "Scan"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayRect: {
    position: "absolute",
  },
  viewfinderBorder: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 8,
  },
  instruction: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.12,
    left: 24,
    right: 24,
    textAlign: "center",
    fontSize: 14,
  },
  buttons: {
    position: "absolute",
    bottom: 48,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  placeholderText: {
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginHorizontal: 24,
    marginBottom: 16,
  },
});
