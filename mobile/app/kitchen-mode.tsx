import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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

  const selectedDate = useDateStore((s) => s.selectedDate);
  const { totals, fetch: fetchEntries } = useDailyLogStore();
  const { goals, fetch: fetchGoals } = useGoalStore();
  const { items, projectedTotals, initSession, applyServerMessage, reset } = useDraftStore();

  const [listeningState, setListeningState] = useState<ListeningState>('idle');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [nativeModuleMissing, setNativeModuleMissing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  // On-screen debug (dev only): last STT result, live interim, or error
  const [debugSttLastResult, setDebugSttLastResult] = useState<string | null>(null);
  const [debugSttInterim, setDebugSttInterim] = useState<string | null>(null);
  const [debugSttLastError, setDebugSttLastError] = useState<string | null>(null);
  const [debugInputText, setDebugInputText] = useState('');
  const [macroPreviewExpanded, setMacroPreviewExpanded] = useState(false);

  // Refs that don't need to trigger re-renders
  const sessionEndedRef = useRef(false);
  const isSavingRef = useRef(false);
  const sttStrategyRef = useRef(createSTTStrategy());

  // ---------------------------------------------------------------------------
  // STT — start / restart listening
  // Defined first so it can be referenced by speakAndResume below.
  // ---------------------------------------------------------------------------

  const startListening = useCallback(() => {
    const strategy = sttStrategyRef.current;
    const callbacks: STTCallbacks = {
      onResult: (transcript) => {
        if (__DEV__) {
          setDebugSttLastResult(transcript);
          setDebugSttInterim(null);
          setDebugSttLastError(null);
        }
        setListeningState('processing');
        voiceSession.sendTranscript(transcript);
      },
      onError: (error) => {
        if (__DEV__) {
          setDebugSttLastError(error);
        }
        if (!sessionEndedRef.current) {
          setTimeout(() => {
            if (!sessionEndedRef.current) startListening();
          }, 1000);
        }
      },
      onInterimResult: __DEV__
        ? (transcript) => setDebugSttInterim(transcript)
        : undefined,
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

  const handleServerMessage = useCallback(
    (msg: WSServerMessage) => {
      applyServerMessage(msg);

      // Restore listening state after non-speech-required responses
      if (
        msg.type === 'items_added' ||
        msg.type === 'item_edited' ||
        msg.type === 'item_removed'
      ) {
        setListeningState('listening');
      }

      if (msg.type === 'clarify') {
        speakAndResume(msg.question);
      } else if (msg.type === 'create_food_prompt') {
        speakAndResume(msg.question);
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
        router.replace('/');
      } else if (msg.type === 'session_cancelled') {
        sessionEndedRef.current = true;
        endSession();
        reset();
        router.back();
      }
    },
    [applyServerMessage, speakAndResume, endSession, fetchEntries, selectedDate, reset, router],
  );

  // ---------------------------------------------------------------------------
  // Mount / unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Load current day's entries so projected totals are accurate from the start
      await fetchEntries(selectedDate).catch(() => {});
      await fetchGoals().catch(() => {});

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

  // Dev/simulator: submit typed text as if it were a voice transcript
  const handleDebugSubmit = useCallback(() => {
    const trimmed = debugInputText.trim();
    if (!trimmed || sessionEndedRef.current) return;
    setDebugInputText('');
    setDebugSttLastResult(trimmed);
    setDebugSttInterim(null);
    setDebugSttLastError(null);
    setListeningState('processing');
    voiceSession.sendTranscript(trimmed);
  }, [debugInputText]);

  const handleCancel = useCallback(() => {
    if (sessionEndedRef.current) return;
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
        onPress: () => {
          if (sessionEndedRef.current) return;
          sessionEndedRef.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          speech.stopListening();
          speech.stopSpeaking();
          voiceSession.sendCancel();
          // Navigation triggered by session_cancelled message from server
        },
      },
    ]);
  }, [items]);

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

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <ThemedText style={[Typography.title3, { color: colors.text }]}>
          Kitchen Mode
        </ThemedText>
        {dateLabel && (
          <ThemedText style={[Typography.footnote, { color: colors.warning }]}>
            {dateLabel}
          </ThemedText>
        )}
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
          goals={goals}
          variant="default"
          showCalorieSummary={!macroPreviewExpanded}
        />
        {macroPreviewExpanded && goals && (
          <View style={[styles.macroPreviewDetails, { borderTopColor: colors.border }]}>
            <MacroPreviewRow
              label="Cal"
              current={projectedTotals.calories}
              goal={goals.calories}
              unit=""
              colors={colors}
            />
            <MacroPreviewRow
              label="P"
              current={projectedTotals.proteinG}
              goal={goals.proteinG}
              unit="g"
              colors={colors}
            />
            <MacroPreviewRow
              label="C"
              current={projectedTotals.carbsG}
              goal={goals.carbsG}
              unit="g"
              colors={colors}
            />
            <MacroPreviewRow
              label="F"
              current={projectedTotals.fatG}
              goal={goals.fatG}
              unit="g"
              colors={colors}
            />
          </View>
        )}
      </Pressable>
      <View style={[styles.hairline, { backgroundColor: colors.border }]} />

      {/* Draft cards */}
      <ScrollView
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
          items.map((item) => <DraftMealCard key={item.id} item={item} />)
        )}
      </ScrollView>

      {/* Bottom controls */}
      <View
        style={[styles.bottomSection, { borderTopColor: colors.border }]}
      >
        <ListeningIndicator state={listeningState} />
        {__DEV__ && (
          <>
            <TextInput
              style={[
                styles.debugInput,
                {
                  backgroundColor: colors.surfaceSecondary,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Type to simulate voice (simulator)"
              placeholderTextColor={colors.textTertiary}
              value={debugInputText}
              onChangeText={setDebugInputText}
              onSubmitEditing={handleDebugSubmit}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <View style={[styles.debugStrip, { backgroundColor: colors.surfaceSecondary }]}>
              <ThemedText
              style={[Typography.caption2, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {debugSttLastError != null
                ? `Error: ${debugSttLastError}`
                : debugSttInterim != null
                  ? `Live: «${debugSttInterim}»`
                  : debugSttLastResult != null
                    ? `Heard: «${debugSttLastResult}»`
                    : listeningState === 'listening' || listeningState === 'processing'
                      ? 'Listening…'
                      : listeningState === 'speaking'
                        ? 'Speaking…'
                        : '—'}
              </ThemedText>
            </View>
          </>
        )}

        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.cancelButton,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={handleCancel}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
            <ThemedText
              style={[Typography.headline, { color: colors.textSecondary }]}
            >
              Cancel
            </ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.saveButton,
              { backgroundColor: colors.tint },
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleSave}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
            <ThemedText style={[Typography.headline, { color: '#fff' }]}>
              Save
            </ThemedText>
          </Pressable>
        </View>
      </View>
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
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 2,
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
    paddingBottom: Spacing.xxxl,
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
    alignItems: 'center',
  },
  debugInput: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    ...Typography.body,
  },
  debugStrip: {
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
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
