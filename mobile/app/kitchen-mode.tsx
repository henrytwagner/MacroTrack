import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as KeepAwake from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import MacroRingProgress from '@/components/MacroRingProgress';
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
import { BarcodeCameraScreen } from '@/features/barcode/BarcodeCameraScreen';
import type { BarcodeScanResult } from '@/features/barcode/types';
import type { WSServerMessage } from '@shared/types';

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
// Component
// ---------------------------------------------------------------------------

export default function KitchenModeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
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
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (items.length > 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [items.length]);

  // Smooth expand/collapse transitions
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [items]);

  const [listeningState, setListeningState] = useState<ListeningState>('idle');
  const [showBarcodeCamera, setShowBarcodeCamera] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [nativeModuleMissing, setNativeModuleMissing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [macroPreviewExpanded, setMacroPreviewExpanded] = useState(false);

  type BottomBarVariant = 'classic' | 'pillsSpread' | 'pillsCenter';

  const [bottomBarVariant, setBottomBarVariant] = useState<BottomBarVariant>('classic');

  type TextDisplayMode = 'off' | 'captions' | 'editing';
  const [textDisplayMode, setTextDisplayMode] = useState<TextDisplayMode>('off');
  const [captionText, setCaptionText] = useState('');
  const [editText, setEditText] = useState('');

  // Refs that don't need to trigger re-renders
  const sessionEndedRef = useRef(false);
  const isSavingRef = useRef(false);
  const sttStrategyRef = useRef(createSTTStrategy());
  const listeningPausedByUserRef = useRef(false);

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
    sttStrategyRef.current.stop();
    speech.stopSpeaking();
    setShowBarcodeCamera(true);
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
    setShowBarcodeCamera(false);
    setListeningState('processing');
    voiceSession.sendBarcodeScan(result.gtin);
  }, []);

  const handleBarcodeCameraCancel = useCallback(() => {
    setShowBarcodeCamera(false);
    if (!sessionEndedRef.current && !listeningPausedByUserRef.current) startListening();
  }, [startListening]);

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
  // Fallback barcode camera (full-screen swap, same pattern as barcode-demo)
  // ---------------------------------------------------------------------------

  if (showBarcodeCamera) {
    return (
      <BarcodeCameraScreen
        defaultFacing="front"
        onScan={handleBarcodeScanResult}
        onCancel={handleBarcodeCameraCancel}
      />
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

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleCancel}
          hitSlop={12}
          style={({ pressed }) => [
            styles.topBarIconLeft,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={colors.textSecondary}
          />
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
          <View
            style={[
              styles.topBarSaveIconPill,
              { backgroundColor: colors.tint },
            ]}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
          </View>
        </Pressable>
      </View>

      {/* Live macro rings (always visible); tap to toggle detail breakdown below */}
      <Pressable
        style={[styles.ringBar, { backgroundColor: colors.surface }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMacroPreviewExpanded((e) => !e);
        }}
      >
        <MacroRingProgress
          totals={projectedTotals}
          goals={goalsByDate[selectedDate] ?? null}
          variant="default"
          showCalorieSummary={!macroPreviewExpanded}
        />
        {macroPreviewExpanded && goalsByDate[selectedDate] && (
          <View style={[styles.macroPreviewDetails, { borderTopColor: colors.border }]}>
            <MacroPreviewRow
              label="Cal"
              current={projectedTotals.calories}
              goal={goalsByDate[selectedDate]!.calories}
              unit=""
              colors={colors}
            />
            <MacroPreviewRow
              label="P"
              current={projectedTotals.proteinG}
              goal={goalsByDate[selectedDate]!.proteinG}
              unit="g"
              colors={colors}
            />
            <MacroPreviewRow
              label="C"
              current={projectedTotals.carbsG}
              goal={goalsByDate[selectedDate]!.carbsG}
              unit="g"
              colors={colors}
            />
            <MacroPreviewRow
              label="F"
              current={projectedTotals.fatG}
              goal={goalsByDate[selectedDate]!.fatG}
              unit="g"
              colors={colors}
            />
          </View>
        )}
      </Pressable>
      <View style={[styles.hairline, { backgroundColor: colors.border }]} />

      {/* Dev-only: toggle between bottom bar layouts */}
      {__DEV__ && (
        <View style={styles.variantToggleRow}>
          <Pressable
            onPress={() => setBottomBarVariant('classic')}
            style={[
              styles.variantToggleChip,
              bottomBarVariant === 'classic' && { backgroundColor: colors.surfaceSecondary },
            ]}
            hitSlop={8}
          >
            <ThemedText
              style={[
                Typography.caption2,
                {
                  color:
                    bottomBarVariant === 'classic' ? colors.text : colors.textTertiary,
                },
              ]}
            >
              Classic
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setBottomBarVariant('pillsSpread')}
            style={[
              styles.variantToggleChip,
              bottomBarVariant === 'pillsSpread' && {
                backgroundColor: colors.surfaceSecondary,
              },
            ]}
            hitSlop={8}
          >
            <ThemedText
              style={[
                Typography.caption2,
                {
                  color:
                    bottomBarVariant === 'pillsSpread'
                      ? colors.text
                      : colors.textTertiary,
                },
              ]}
            >
              Pills
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setBottomBarVariant('pillsCenter')}
            style={[
              styles.variantToggleChip,
              bottomBarVariant === 'pillsCenter' && { backgroundColor: colors.surfaceSecondary },
            ]}
            hitSlop={8}
          >
            <ThemedText
              style={[
                Typography.caption2,
                {
                  color:
                    bottomBarVariant === 'pillsCenter' ? colors.text : colors.textTertiary,
                },
              ]}
            >
              Pills C
            </ThemedText>
          </Pressable>
        </View>
      )}

      {/* Draft cards */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          items.length === 0 && styles.scrollContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      >
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
            />
          ))
        )}
      </ScrollView>

      {/* Floating caption / edit row — above the bottom controls; only edit row moves with keyboard */}
      {textDisplayMode !== 'off' && textDisplayMode === 'editing' && (
        <KeyboardAvoidingView
          style={[
            styles.floatingOverlay,
            bottomBarVariant === 'classic'
              ? styles.floatingAboveClassic
              : styles.floatingAbovePills,
          ]}
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
                placeholder="Edit before sending…"
                placeholderTextColor={colors.textTertiary}
                value={editText}
                onChangeText={setEditText}
                onSubmitEditing={handleEditSubmit}
                returnKeyType="send"
                blurOnSubmit={false}
                autoFocus
              />
              <Pressable onPress={handleEditSubmit} hitSlop={8}>
                <Ionicons name="arrow-up-circle" size={28} color={colors.tint} />
              </Pressable>
              <Pressable onPress={exitEditMode} hitSlop={8} style={styles.discardButton}>
                <ThemedText style={[Typography.footnote, { color: colors.destructive }]}>
                  Discard
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {textDisplayMode !== 'off' && textDisplayMode !== 'editing' && (
        <View
          style={[
            styles.floatingOverlay,
            bottomBarVariant === 'classic'
              ? styles.floatingAboveClassic
              : styles.floatingAbovePills,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.floatingInner}>
            <Pressable
              onPress={handleCaptionTap}
              style={[styles.floatingCaptionPill, { backgroundColor: colors.surfaceSecondary }]}
            >
              <View style={styles.captionTextContainer}>
                <ThemedText
                  style={[Typography.footnote, { color: colors.text, textAlign: 'center' }]}
                  numberOfLines={2}
                >
                  {captionText || 'Listening for speech…'}
                </ThemedText>
              </View>
              {captionText ? (
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={colors.textTertiary}
                  style={styles.captionEditIcon}
                />
              ) : null}
            </Pressable>
          </View>
        </View>
      )}

      {/* Floating bottom pills for variants 2 & 3 */}
      {(bottomBarVariant === 'pillsSpread' || bottomBarVariant === 'pillsCenter') && (
        <View pointerEvents="box-none" style={styles.bottomPillsFloatingContainer}>
          {bottomBarVariant === 'pillsSpread' ? (
            <View style={styles.bottomPillsRowSpread}>
              <Pressable
                onPress={handleCaptionToggle}
                style={[styles.bottomPill, { backgroundColor: colors.surfaceSecondary }]}
                hitSlop={8}
              >
                <Ionicons
                  name="text-outline"
                  size={22}
                  color={textDisplayMode !== 'off' ? colors.tint : colors.textSecondary}
                />
              </Pressable>
              <View
                style={[
                  styles.bottomPill,
                  styles.bottomPillLarge,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <ListeningIndicator
                  state={listeningState}
                  onPress={handleListeningIndicatorPress}
                  showLabel={false}
                />
              </View>
              <Pressable
                onPress={handleBarcodeButtonPress}
                style={[styles.bottomPill, { backgroundColor: colors.surfaceSecondary }]}
                hitSlop={8}
              >
                <Ionicons
                  name="barcode-outline"
                  size={22}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          ) : (
            <View style={styles.bottomPillsRowCenter}>
              <Pressable
                onPress={handleCaptionToggle}
                style={[styles.bottomPill, { backgroundColor: colors.surfaceSecondary }]}
                hitSlop={8}
              >
                <Ionicons
                  name="text-outline"
                  size={22}
                  color={textDisplayMode !== 'off' ? colors.tint : colors.textSecondary}
                />
              </Pressable>
              <View
                style={[
                  styles.bottomPill,
                  styles.bottomPillLarge,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <ListeningIndicator
                  state={listeningState}
                  onPress={handleListeningIndicatorPress}
                  showLabel={false}
                />
              </View>
              <Pressable
                onPress={handleBarcodeButtonPress}
                style={[styles.bottomPill, { backgroundColor: colors.surfaceSecondary }]}
                hitSlop={8}
              >
                <Ionicons
                  name="barcode-outline"
                  size={22}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Fixed bottom bar (only renders in classic variant) */}
      {bottomBarVariant === 'classic' && (
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
                size={26}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
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
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  ringBar: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroPreviewDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  macroPreviewRow: {
    flex: 1,
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
  },
  scrollContentEmpty: {
    flex: 1,
    justifyContent: 'center',
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
    gap: Spacing.lg,
    alignItems: 'stretch',
  },
  variantToggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  variantToggleChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  bottomPillsFloatingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.xxxl,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  bottomPillsRowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '90%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  bottomPillsRowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  bottomPill: {
    borderRadius: BorderRadius.full,
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomPillLarge: {
    height: 72,
    width: 72,
  },
  floatingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
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
  floatingAbovePills: {
    bottom: Spacing.xxxl * 2.75,
  },
  floatingAboveClassic: {
    bottom: Spacing.xxxl,
  },
  floatingCaptionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  captionTextContainer: {
    maxWidth: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captionEditIcon: {
    marginLeft: Spacing.xs,
  },
  editingInput: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    ...Typography.body,
  },
  discardButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  keyboardIconButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    padding: Spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  cancelButton: {
    borderWidth: 1.5,
  },
  saveButton: {},
  topBarCancel: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  topBarSave: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  topBarPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
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
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  listeningIndicatorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcodeIconButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    padding: Spacing.xs,
  },
});
