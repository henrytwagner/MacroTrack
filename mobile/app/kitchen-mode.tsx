import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as KeepAwake from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import MacroRingProgress, { SingleMacroRing } from '@/components/MacroRingProgress';
import DraftMealCard from '@/components/DraftMealCard';
import ListeningIndicator, { type ListeningState } from '@/components/ListeningIndicator';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDateStore } from '@/stores/dateStore';
import { useDailyLogStore } from '@/stores/dailyLogStore';
import { useDraftStore } from '@/stores/draftStore';
import { useGoalStore } from '@/stores/goalStore';
import * as voiceSession from '@/services/voiceSession';
import * as speech from '@/services/speech';
import { createSTTStrategy, type STTCallbacks } from '@/services/sttStrategy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { BarcodeScanResult } from '@/features/barcode/types';
import { normalizeToGTIN } from '@/features/barcode/gtin';
import type { WSServerMessage } from '@shared/types';

// Macro pill is ~48px tall (paddingVertical 8×2 + compact ring 32px); half used to
// position the pill flush with the camera feed / cards boundary in barcode mode.
const MACRO_PILL_HALF_HEIGHT = 24;

// ---------------------------------------------------------------------------
// Macro preview row (tap-to-expand details)
// ---------------------------------------------------------------------------

function MacroPreviewRow({
  label,
  current,
  goal,
  unit,
  colors,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  colors: Record<string, string>;
}) {
  const remaining = goal - current;
  const isOver = remaining < 0;
  const text =
    remaining >= 0
      ? `${Math.round(remaining)}${unit} left`
      : `${Math.round(Math.abs(remaining))}${unit} over`;
  return (
    <View style={styles.macroPreviewRow}>
      <ThemedText style={[Typography.caption2, { color: colors.textSecondary }]}>
        {label}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption2,
          { color: isOver ? colors.progressOverflow : colors.textSecondary },
          styles.macroPreviewValue,
        ]}
      >
        {Math.round(current)} / {goal}
      </ThemedText>
      <ThemedText
        style={[
          Typography.caption2,
          { color: isOver ? colors.progressOverflow : colors.textTertiary },
        ]}
      >
        {text}
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// DoubleTapFlip — CameraView wrapper that flips camera on double-tap
// ---------------------------------------------------------------------------

function DoubleTapFlip({
  width,
  height,
  facing,
  flash,
  onFlip,
  onBarcodeScanned,
}: {
  width: number;
  height: number;
  facing: 'front' | 'back';
  flash: boolean;
  onFlip: () => void;
  onBarcodeScanned: (scan: { data: string; type: string }) => void;
}) {
  const lastTapRef = useRef(0);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onFlip();
    }
    lastTapRef.current = now;
  }, [onFlip]);

  return (
    <Pressable onPress={handleTap} style={{ width, height }}>
      <CameraView
        style={{ width, height }}
        facing={facing}
        enableTorch={flash}
        barcodeScannerEnabled
        onBarcodeScanned={onBarcodeScanned}
        pointerEvents="none"
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KitchenModeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const feedHeight = screenWidth * (3 / 4);
  const barcodeModeScrollY = useRef(new Animated.Value(0)).current;
  // Distance the bar travels before it sticks (initial top → sticky top).
  // Bar starts at: feedHeight - MACRO_PILL_HALF_HEIGHT
  // Bar sticks at: Spacing.md (lines up with the camera nav buttons)
  const BAR_TRAVEL = feedHeight - MACRO_PILL_HALF_HEIGHT - Spacing.xs;
  const barTranslateY = barcodeModeScrollY.interpolate({
    inputRange: [0, BAR_TRAVEL],
    outputRange: [0, -BAR_TRAVEL],
    extrapolate: 'clamp',
  });
  const { from } = useLocalSearchParams<{ from?: string }>();

  const selectedDate = useDateStore((s) => s.selectedDate);
  const { totals, fetch: fetchEntries } = useDailyLogStore();
  const { goalsByDate, fetch: fetchGoals } = useGoalStore();
  const { items, projectedTotals, initSession, applyServerMessage, reset } = useDraftStore();

  // Reversed items so newest appears at top; activeId is the first non-normal card or topmost card
  const reversedItems = useMemo(() => [...items].reverse(), [items]);
  const activeId =
    reversedItems.find((i) => i.state !== 'normal')?.id ?? reversedItems[0]?.id;

  // Auto-scroll to top when a new card is added
  const scrollRef = useRef<any>(null);
  useEffect(() => {
    if (items.length > 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [items.length]);

  // Smooth expand/collapse transitions
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [items]);

  const [listeningState, setListeningState] = useState<ListeningState>('idle');
  const [barcodeModeActive, setBarcodeModeActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [nativeModuleMissing, setNativeModuleMissing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [macroPreviewExpanded, setMacroPreviewExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  type TextDisplayMode = 'off' | 'captions' | 'editing';
  const [textDisplayMode, setTextDisplayMode] = useState<TextDisplayMode>('off');
  const [captionText, setCaptionText] = useState('');
  const [editText, setEditText] = useState('');

  // Refs that don't need to trigger re-renders
  const sessionEndedRef = useRef(false);
  const isSavingRef = useRef(false);
  const sttStrategyRef = useRef(createSTTStrategy());
  const listeningPausedByUserRef = useRef(false);
  const lastScannedGtinRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number>(0);
  const cameraDoubleTapRef = useRef<number>(0);

  // Request camera permission the first time barcode mode is activated
  useEffect(() => {
    if (barcodeModeActive && !cameraPermission?.granted) {
      requestCameraPermission();
    }
  }, [barcodeModeActive, cameraPermission?.granted, requestCameraPermission]);

  // Reset scroll position and bar tracker when leaving barcode mode
  useEffect(() => {
    if (!barcodeModeActive) {
      barcodeModeScrollY.setValue(0);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [barcodeModeActive, barcodeModeScrollY]);

  // ---------------------------------------------------------------------------
  // STT — start / restart listening
  // Defined first so it can be referenced by speakAndResume below.
  // ---------------------------------------------------------------------------

  const startListening = useCallback(() => {
    const strategy = sttStrategyRef.current;
    const callbacks: STTCallbacks = {
      onResult: (transcript) => {
        setListeningState('processing');
        voiceSession.sendTranscript(transcript); // always auto-submit
        setCaptionText('');                       // clear caption after submit
      },
      onError: () => {
        if (!sessionEndedRef.current) {
          setTimeout(() => {
            if (!sessionEndedRef.current) startListening();
          }, 1000);
        }
      },
      onInterimResult: (transcript) => {
        setCaptionText(transcript); // always track, shown only when captions on
      },
      onEnd: () => {
        // STT ended (iOS silence timeout) — silently restart without
        // dropping to 'idle' so the animation doesn't flicker.
        if (!sessionEndedRef.current) {
          setTimeout(() => {
            if (!sessionEndedRef.current) startListening();
          }, 300);
        }
      },
    };

    strategy.start(callbacks);
    setListeningState('listening');
  }, []);

  // ---------------------------------------------------------------------------
  // TTS — speak a prompt then resume listening
  // ---------------------------------------------------------------------------

  const speakAndResume = useCallback(
    (text: string) => {
      if (!text || sessionEndedRef.current) return;
      sttStrategyRef.current.stop();
      setListeningState('speaking');
      speech.speak(text, () => {
        if (!sessionEndedRef.current) startListening();
      });
    },
    [startListening],
  );

  // ---------------------------------------------------------------------------
  // Cleanup helpers
  // ---------------------------------------------------------------------------

  const endSession = useCallback(() => {
    sttStrategyRef.current.stop();
    speech.stopSpeaking();
    voiceSession.disconnect();
    KeepAwake.deactivateKeepAwake();
  }, []);

  // ---------------------------------------------------------------------------
  // WebSocket message handler
  // ---------------------------------------------------------------------------

  const handleBarcodeButtonPress = useCallback(() => {
    if (sessionEndedRef.current) return;
    setBarcodeModeActive((prev) => !prev);
    // No STT stop/start — barcode mode is non-interrupting like captions
  }, []);

  const handleServerMessage = useCallback(
    (msg: WSServerMessage) => {
      applyServerMessage(msg);

      // Restore listening state after non-speech-required responses (unless user paused)
      if (
        (msg.type === 'items_added' ||
          msg.type === 'item_edited' ||
          msg.type === 'item_removed') &&
        !listeningPausedByUserRef.current
      ) {
        setListeningState('listening');
      }

      if (msg.type === 'draft_replaced') {
        speakAndResume(msg.message);
      } else if (msg.type === 'operation_cancelled') {
        speakAndResume(msg.message);
      } else if (msg.type === 'open_barcode_scanner') {
        handleBarcodeButtonPress();
      } else if (msg.type === 'ask') {
        speakAndResume(msg.question);
      } else if (msg.type === 'clarify') {
        speakAndResume(msg.question);
      } else if (msg.type === 'create_food_prompt') {
        if (msg.question) speakAndResume(msg.question);
      } else if (msg.type === 'create_food_field') {
        speakAndResume(msg.question);
      } else if (msg.type === 'create_food_complete') {
        speakAndResume(`Got it. ${msg.item.name} has been added.`);
      } else if (msg.type === 'error') {
        speakAndResume(msg.message);
      } else if (msg.type === 'session_saved') {
        sessionEndedRef.current = true;
        endSession();
        fetchEntries(selectedDate).catch(() => {});
        reset();
        if (from === 'log') {
          router.back();
        } else {
          router.replace('/(tabs)/log');
        }
      } else if (msg.type === 'session_cancelled') {
        sessionEndedRef.current = true;
        endSession();
        reset();
        router.back();
      }
    },
    [applyServerMessage, speakAndResume, endSession, fetchEntries, selectedDate, reset, router, from, handleBarcodeButtonPress],
  );

  // ---------------------------------------------------------------------------
  // Mount / unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Load current day's entries so projected totals are accurate from the start
      await fetchEntries(selectedDate).catch(() => {});
      await fetchGoals(selectedDate).catch(() => {});

      if (!mounted) return;

      // Snapshot the current totals into the draft store
      // We read from the store directly via getState() to avoid stale closure
      const currentTotals = useDailyLogStore.getState().totals;
      initSession(currentTotals);

      // Check native module availability (requires dev build, not Expo Go)
      const textOnlyDebug = __DEV__ && !speech.isSTTAvailable();
      if (!speech.isSTTAvailable() && !textOnlyDebug) {
        setNativeModuleMissing(true);
        return;
      }

      // Request microphone permission (skip in text-only debug mode for simulator)
      if (!textOnlyDebug) {
        const granted = await speech.requestSpeechPermission();
        if (!mounted) return;
        if (!granted) {
          setPermissionDenied(true);
          return;
        }
      }

      // Connect WebSocket
      try {
        await voiceSession.connect(
          selectedDate,
          handleServerMessage,
          () => {
            if (!mounted || sessionEndedRef.current) return;
            setConnectionError(
              'Connection lost. Your items have been saved.',
            );
            sttStrategyRef.current.stop();
          },
          sttStrategyRef.current.mode,
        );
      } catch {
        if (!mounted) return;
        setConnectionError(
          'Unable to connect to server. Check your connection.',
        );
        return;
      }

      if (!mounted) return;

      KeepAwake.activateKeepAwakeAsync();
      if (!textOnlyDebug) {
        startListening();
      }
    }

    init();

    return () => {
      mounted = false;
      // Auto-save on navigate away: just close the WS cleanly.
      // The server's onclose handler saves any pending draft items.
      if (!sessionEndedRef.current && !isSavingRef.current) {
        sessionEndedRef.current = true;
        sttStrategyRef.current.stop();
        speech.stopSpeaking();
        voiceSession.disconnect();
      }
      KeepAwake.deactivateKeepAwake();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  // ---------------------------------------------------------------------------
  // Manual transcript (from card buttons in choice/creating/usda_pending states)
  // ---------------------------------------------------------------------------

  const handleSendTranscript = useCallback((text: string) => {
    setListeningState('processing');
    voiceSession.sendTranscript(text);
  }, []);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    if (isSavingRef.current || sessionEndedRef.current) return;
    isSavingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sttStrategyRef.current.stop();
    speech.stopSpeaking();
    setListeningState('idle');
    voiceSession.sendSave();
    // Navigation triggered by session_saved message from server
  }, []);

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  // Shared exit-edit helper (used by Discard, toggle button, and after Send)
  const exitEditMode = useCallback(() => {
    setEditText('');
    setTextDisplayMode('captions');
    listeningPausedByUserRef.current = false;
    startListening(); // resume STT
  }, [startListening]);

  // Toggle button: off ↔ captions, or discard if currently editing
  const handleCaptionToggle = useCallback(() => {
    if (textDisplayMode === 'editing') {
      exitEditMode();
      return;
    }
    setTextDisplayMode((prev) => (prev === 'off' ? 'captions' : 'off'));
    setCaptionText('');
  }, [textDisplayMode, exitEditMode]);

  // Tap the caption pill → pause voice, enter editing
  const handleCaptionTap = useCallback(() => {
    sttStrategyRef.current.stop();
    speech.stopSpeaking();
    listeningPausedByUserRef.current = true;
    setListeningState('paused');
    setEditText(captionText); // prefill with what was heard
    setTextDisplayMode('editing');
  }, [captionText]);

  // Send from edit mode
  const handleEditSubmit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed || sessionEndedRef.current) return;
    setEditText('');
    setCaptionText('');
    setTextDisplayMode('captions');
    listeningPausedByUserRef.current = false;
    voiceSession.sendTranscript(trimmed);
    startListening(); // restart STT immediately
  }, [editText, startListening]);

  const performCancel = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    speech.stopListening();
    speech.stopSpeaking();
    voiceSession.sendCancel();

    // Prefer server-driven navigation via session_cancelled, but if that
    // never arrives (e.g., WS failure), fall back to a local navigation so
    // the user is never stuck on this screen.
    setTimeout(() => {
      if (!sessionEndedRef.current) return;
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/log');
      }
    }, 1800);
  }, [router]);

  // Tap listening icon: pause (stop STT/TTS) or resume
  const handleListeningIndicatorPress = useCallback(() => {
    if (sessionEndedRef.current) return;
    if (listeningState === 'paused') {
      listeningPausedByUserRef.current = false;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startListening();
    } else if (
      listeningState === 'listening' ||
      listeningState === 'processing' ||
      listeningState === 'speaking'
    ) {
      listeningPausedByUserRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sttStrategyRef.current.stop();
      speech.stopSpeaking();
      setListeningState('paused');
    }
  }, [listeningState, startListening]);

  const handleBarcodeScanResult = useCallback((result: BarcodeScanResult) => {
    setListeningState('processing');
    // Normalize to digits only (gtin from scanner is already normalized, but be safe)
    const digits = result.gtin.replace(/\D/g, '');
    // If a creating card has barcode as the current field, send as a transcript
    // so it flows through the normal CREATE_FOOD_RESPONSE pipeline
    const isFillingBarcodeField = items.some(
      (i) => i.state === 'creating' && i.creatingProgress?.currentField === 'barcode',
    );
    if (isFillingBarcodeField) {
      voiceSession.sendTranscript(digits);
    } else {
      voiceSession.sendBarcodeScan(digits);
    }
  }, [items]);

  // Double-tap the spacer above the sheet to flip camera (the actual CameraView is
  // behind the ScrollView and can't receive taps directly)
  const handleCameraAreaTap = useCallback(() => {
    const now = Date.now();
    if (now - cameraDoubleTapRef.current < 300) {
      setCameraFacing((f) => (f === 'back' ? 'front' : 'back'));
    }
    cameraDoubleTapRef.current = now;
  }, []);

  // Inline camera scan — deduplicates rapid re-fires (same code within 2s)
  const handleInlineScan = useCallback(({ data, type }: { data: string; type: string }) => {
    if (sessionEndedRef.current) return;
    let gtin: string;
    try {
      gtin = normalizeToGTIN(data, type);
    } catch {
      return; // invalid barcode, ignore
    }
    const now = Date.now();
    if (gtin === lastScannedGtinRef.current && now - lastScannedAtRef.current < 2000) return;
    lastScannedGtinRef.current = gtin;
    lastScannedAtRef.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleBarcodeScanResult({ gtin, raw: data, format: type });
  }, [handleBarcodeScanResult]);

  const handleOptionsPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const flashLabel = flashEnabled ? 'Flashlight: On  (tap to turn off)' : 'Flashlight: Off  (tap to turn on)';
    Alert.alert('Input Mode', 'Switch input mode:', [
      { text: 'Voice', onPress: () => {} },
      { text: 'Text', onPress: () => {} },
      { text: 'Camera', onPress: () => {} },
      ...(barcodeModeActive
        ? [{ text: flashLabel, onPress: () => setFlashEnabled((f) => !f) }]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [barcodeModeActive, flashEnabled]);

  const handleCancel = useCallback(() => {
    if (sessionEndedRef.current) return;
    // No items added and no action taken — close without confirming
    if (items.length === 0) {
      performCancel();
      return;
    }
    const count = items.filter((i) => i.state === 'normal').length;
    const message =
      count > 0
        ? `Discard ${count} item${count !== 1 ? 's' : ''}?`
        : 'End this session without saving?';

    Alert.alert('Cancel Session', message, [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: performCancel,
      },
    ]);
  }, [items, performCancel]);

  // ---------------------------------------------------------------------------
  // Permission / connection error screens
  // ---------------------------------------------------------------------------

  if (nativeModuleMissing) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.errorState}>
          <Ionicons name="build-outline" size={56} color={colors.textTertiary} />
          <ThemedText
            style={[Typography.headline, { color: colors.text, textAlign: 'center' }]}
          >
            Development Build Required
          </ThemedText>
          <ThemedText
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center' },
            ]}
          >
            Kitchen Mode uses on-device speech recognition which requires a native build.
            {'\n\n'}
            Run{' '}
            <ThemedText style={{ fontFamily: 'Menlo', fontSize: 14 }}>
              npx expo run:ios
            </ThemedText>
            {' '}to create a development build.
          </ThemedText>
          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <ThemedText style={[Typography.headline, { color: '#fff' }]}>
              Go Back
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (permissionDenied) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.errorState}>
          <Ionicons name="mic-off-outline" size={56} color={colors.textTertiary} />
          <ThemedText
            style={[Typography.headline, { color: colors.text, textAlign: 'center' }]}
          >
            Microphone Access Required
          </ThemedText>
          <ThemedText
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center' },
            ]}
          >
            Kitchen Mode needs microphone access. Enable it in your device Settings.
          </ThemedText>
          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <ThemedText style={[Typography.headline, { color: '#fff' }]}>
              Go Back
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (connectionError) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.errorState}>
          <Ionicons
            name="cloud-offline-outline"
            size={56}
            color={colors.textTertiary}
          />
          <ThemedText
            style={[Typography.headline, { color: colors.text, textAlign: 'center' }]}
          >
            Connection Error
          </ThemedText>
          <ThemedText
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center' },
            ]}
          >
            {connectionError}
          </ThemedText>
          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={() => router.back()}
          >
            <ThemedText style={[Typography.headline, { color: '#fff' }]}>
              Go Back
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Main screen
  // ---------------------------------------------------------------------------

  const isToday =
    selectedDate === new Date().toISOString().split('T')[0];
  const dateLabel = !isToday
    ? `Logging to ${new Date(selectedDate + 'T12:00:00').toLocaleDateString(
        'en-US',
        { month: 'short', day: 'numeric' },
      )}`
    : null;

  const renderMacroBar = () => (
    <>
      <Pressable
        style={[
          macroPreviewExpanded ? [styles.squircleCard, { flex: 1 }] : styles.macroPill,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMacroPreviewExpanded((e) => !e);
        }}
      >
        {macroPreviewExpanded && goalsByDate[selectedDate] ? (
          <View style={styles.macroGrid}>
            {([
              { label: 'Cal', current: projectedTotals.calories, goal: goalsByDate[selectedDate]!.calories, unit: '', color: colors.caloriesAccent },
              { label: 'P', current: projectedTotals.proteinG, goal: goalsByDate[selectedDate]!.proteinG, unit: 'g', color: colors.proteinAccent },
              { label: 'C', current: projectedTotals.carbsG, goal: goalsByDate[selectedDate]!.carbsG, unit: 'g', color: colors.carbsAccent },
              { label: 'F', current: projectedTotals.fatG, goal: goalsByDate[selectedDate]!.fatG, unit: 'g', color: colors.fatAccent },
            ] as const).map(({ label, current, goal, unit, color }) => (
              <View key={label} style={styles.macroColumn}>
                <SingleMacroRing
                  size={32}
                  strokeWidth={3}
                  current={current}
                  goal={goal}
                  accentColor={color}
                  trackColor={colors.progressTrack}
                />
                <MacroPreviewRow
                  label={label}
                  current={current}
                  goal={goal}
                  unit={unit}
                  colors={colors}
                />
              </View>
            ))}
          </View>
        ) : (
          <MacroRingProgress
            totals={projectedTotals}
            goals={goalsByDate[selectedDate] ?? null}
            variant="compact"
            showCalorieSummary={false}
          />
        )}
      </Pressable>

      {!macroPreviewExpanded && (
        <Pressable
          onPress={handleOptionsPress}
          hitSlop={8}
          style={[styles.optionsButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Navigation bar — hidden in barcode mode (buttons move onto feed) */}
      {!barcodeModeActive && (
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={handleCancel}
            hitSlop={12}
            style={({ pressed }) => [
              styles.topBarIconLeft,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.topBarTitleContainer}>
            <ThemedText style={[Typography.title3, { color: colors.text }]}>
              Kitchen Mode
            </ThemedText>
            {dateLabel && (
              <ThemedText style={[Typography.footnote, { color: colors.warning }]}>
                {dateLabel}
              </ThemedText>
            )}
          </View>

          <Pressable
            onPress={handleSave}
            hitSlop={12}
            style={({ pressed }) => [
              styles.topBarIconRight,
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={[styles.topBarSaveIconPill, { backgroundColor: colors.tint }]}>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </View>
          </Pressable>
        </View>
      )}

      {/* Content area: draft cards + floating overlays */}
      <View style={styles.contentArea}>
        {barcodeModeActive && (
          <>
            {/* Camera — absolute, behind the ScrollView */}
            <View style={[styles.cameraFeedAbsolute, { height: feedHeight }]}>
              {cameraPermission?.granted ? (
                <DoubleTapFlip
                  width={screenWidth}
                  height={feedHeight}
                  facing={cameraFacing}
                  flash={flashEnabled}
                  onFlip={() => setCameraFacing((f) => (f === 'back' ? 'front' : 'back'))}
                  onBarcodeScanned={handleInlineScan}
                />
              ) : (
                <View style={[styles.cameraFeedPlaceholder, { width: screenWidth, height: feedHeight }]} />
              )}
            </View>

            {/* Nav overlay — absolute, in front of camera */}
            <View style={styles.cameraNavOverlay} pointerEvents="box-none">
              <Pressable
                onPress={handleCancel}
                hitSlop={12}
                style={({ pressed }) => [styles.cameraNavButton, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </Pressable>
              <Pressable
                onPress={handleSave}
                hitSlop={12}
                style={({ pressed }) => [pressed && { opacity: 0.8 }]}
              >
                <View style={[styles.topBarSaveIconPill, { backgroundColor: colors.tint }]}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
              </Pressable>
            </View>
          </>
        )}
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            barcodeModeActive ? undefined : styles.scrollContent,
            items.length === 0 && !barcodeModeActive && styles.scrollContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: barcodeModeScrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
        >
          {barcodeModeActive ? (
            <>
              {/* 0: transparent spacer — full camera height so the sheet starts exactly at the camera
                   bottom edge; the bar (top: feedHeight-MACRO_PILL_HALF_HEIGHT) then straddles that
                   boundary with its top half over the camera and bottom half over the white sheet */}
              <Pressable onPress={handleCameraAreaTap} style={{ height: feedHeight }} />

              {/* 1: sheet header — rounded top corners, clears floating bar */}
              <View style={[styles.sheetHeader, { backgroundColor: colors.background }]} />

              {/* 2: sheet body — cards */}
              <View style={[styles.sheetBody, { backgroundColor: colors.background, minHeight: screenHeight }]}>
                {items.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="mic-outline" size={48} color={colors.textTertiary} />
                    <ThemedText
                      style={[
                        Typography.body,
                        {
                          color: colors.textSecondary,
                          textAlign: 'center',
                          marginTop: Spacing.md,
                        },
                      ]}
                    >
                      Start speaking to log food.{'\n'}Try: "200 grams of chicken breast"
                    </ThemedText>
                  </View>
                ) : (
                  reversedItems.map((item) => (
                    <DraftMealCard
                      key={item.id}
                      item={item}
                      isActive={item.id === activeId}
                      onSendTranscript={handleSendTranscript}
                      onOpenBarcodeScanner={handleBarcodeButtonPress}
                    />
                  ))
                )}
              </View>
            </>
          ) : (
            items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mic-outline" size={48} color={colors.textTertiary} />
                <ThemedText
                  style={[
                    Typography.body,
                    {
                      color: colors.textSecondary,
                      textAlign: 'center',
                      marginTop: Spacing.md,
                    },
                  ]}
                >
                  Start speaking to log food.{'\n'}Try: "200 grams of chicken breast"
                </ThemedText>
              </View>
            ) : (
              reversedItems.map((item) => (
                <DraftMealCard
                  key={item.id}
                  item={item}
                  isActive={item.id === activeId}
                  onSendTranscript={handleSendTranscript}
                  onOpenBarcodeScanner={handleBarcodeButtonPress}
                />
              ))
            )
          )}
        </Animated.ScrollView>

        {/* Macro bar — animated overlay in barcode mode, static overlay in normal mode */}
        {barcodeModeActive ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.macroOverlay,
              {
                top: feedHeight - MACRO_PILL_HALF_HEIGHT,
                transform: [{ translateY: barTranslateY }],
              },
            ]}
          >
            {renderMacroBar()}
          </Animated.View>
        ) : (
          <View pointerEvents="box-none" style={styles.macroOverlay}>
            {renderMacroBar()}
          </View>
        )}

        {/* Floating caption / edit row — above the bottom bar */}
        {textDisplayMode !== 'off' && textDisplayMode === 'editing' && (
          <KeyboardAvoidingView
            style={[styles.floatingOverlay, styles.floatingAboveBottom]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
            pointerEvents="box-none"
          >
            <View style={styles.floatingInner}>
              <View
                style={[
                  styles.floatingEditRow,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={[styles.editingInput, { color: colors.text }]}
                  placeholder="Type to send…"
                  placeholderTextColor={colors.textTertiary}
                  value={editText}
                  onChangeText={setEditText}
                  onSubmitEditing={handleEditSubmit}
                  onBlur={exitEditMode}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  autoFocus
                />
                <Pressable onPress={handleEditSubmit} hitSlop={8}>
                  <Ionicons name="arrow-up-circle" size={28} color={colors.tint} />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}

        {textDisplayMode !== 'off' && textDisplayMode !== 'editing' && (
          <View
            style={[styles.floatingOverlay, styles.floatingAboveBottom]}
            pointerEvents="box-none"
          >
            <View style={styles.floatingInner}>
              <View
                style={[styles.floatingCaptionRow, { backgroundColor: colors.surfaceSecondary }]}
              >
                {captionText ? (
                  <ThemedText
                    style={[Typography.footnote, { color: colors.text, flex: 1 }]}
                    numberOfLines={2}
                  >
                    {captionText}
                  </ThemedText>
                ) : null}
                <Pressable onPress={handleCaptionTap} hitSlop={12} style={styles.captionEditButton}>
                  <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomSection, { borderTopColor: colors.border }]}>
        <View style={styles.listeningRow}>
          <Pressable
            onPress={handleCaptionToggle}
            style={styles.keyboardIconButton}
            hitSlop={8}
          >
            <Ionicons
              name="text-outline"
              size={24}
              color={textDisplayMode !== 'off' ? colors.tint : colors.textSecondary}
            />
          </Pressable>
          <View style={styles.listeningIndicatorCenter}>
            <ListeningIndicator
              state={listeningState}
              onPress={handleListeningIndicatorPress}
            />
          </View>
          <Pressable
            onPress={handleBarcodeButtonPress}
            style={styles.barcodeIconButton}
            hitSlop={8}
          >
            <Ionicons
              name="barcode-outline"
              size={24}
              color={barcodeModeActive ? colors.tint : colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarIconLeft: {
    position: 'absolute',
    left: Spacing.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  topBarIconRight: {
    position: 'absolute',
    right: Spacing.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  topBarSaveIconPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  contentArea: {
    flex: 1,
  },
  macroOverlay: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    zIndex: 10,
  },
  optionsButton: {
    borderRadius: BorderRadius.full,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  macroPill: {
    borderRadius: 999,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  squircleCard: {
    borderRadius: 28,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  macroGrid: {
    flexDirection: 'row',
  },
  macroColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  macroPreviewRow: {
    alignItems: 'center',
    gap: 2,
  },
  macroPreviewValue: {
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingTop: 64, // clear the floating macro ring pill
  },
  scrollContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },
  cameraFeedPlaceholder: {
    backgroundColor: '#007AFF',
  },
  cameraNavOverlay: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  cameraNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraFeedAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  sheetHeader: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: MACRO_PILL_HALF_HEIGHT + Spacing.sm,
    paddingBottom: 0,
    paddingHorizontal: Spacing.lg,
  },
  sheetBody: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  macroBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  bottomSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    alignItems: 'stretch',
  },
  floatingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
  },
  floatingAboveBottom: {
    // Positions above the bottom edge of contentArea (above the bottomSection border)
    bottom: Spacing.sm,
  },
  floatingInner: {
    paddingHorizontal: Spacing.xl,
  },
  floatingEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  floatingCaptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    minWidth: 44,
  },
  captionEditButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  editingInput: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    ...Typography.body,
  },
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
  },
  listeningIndicatorCenter: {
    flex: 1,
    alignItems: 'center',
  },
  // Icons use paddingTop to visually center on the bars (36px tall), not the full
  // indicator height (bars 36 + gap 8 + label 18 = 62px). Offset = (36 - 24) / 2 = 6
  keyboardIconButton: {
    position: 'absolute',
    left: 0,
    paddingTop: 6,
    padding: Spacing.xs,
  },
  barcodeIconButton: {
    position: 'absolute',
    right: 0,
    paddingTop: 6,
    padding: Spacing.xs,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  button: {
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
});
