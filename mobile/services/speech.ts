import * as Speech from 'expo-speech';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type STTResultCallback = (transcript: string) => void;
export type STTErrorCallback = (error: string) => void;

// ---------------------------------------------------------------------------
// Lazy native module loading
//
// expo-speech-recognition is a native module that requires a development
// build (npx expo run:ios). To avoid crashing the rest of the app when
// running in Expo Go, we resolve the module lazily on first use.
// ---------------------------------------------------------------------------

let _sttModule: any | null = null;
let _sttModuleChecked = false;

function getSTTModule() {
  if (_sttModuleChecked) return _sttModule;
  _sttModuleChecked = true;
  try {
    const mod = require('expo-speech-recognition');
    _sttModule = mod.ExpoSpeechRecognitionModule;
  } catch {
    _sttModule = null;
  }
  return _sttModule;
}

/**
 * Returns true if the speech recognition native module is available.
 * Will be false in Expo Go — requires a development build.
 */
export function isSTTAvailable(): boolean {
  return getSTTModule() != null;
}

// ---------------------------------------------------------------------------
// Speech-to-Text
// ---------------------------------------------------------------------------

let sttResultListener: { remove: () => void } | null = null;
let sttErrorListener: { remove: () => void } | null = null;
let sttEndListener: { remove: () => void } | null = null;

/**
 * Request microphone and speech recognition permission.
 * Returns true if granted, false if denied or native module unavailable.
 */
export async function requestSpeechPermission(): Promise<boolean> {
  const mod = getSTTModule();
  if (!mod) return false;
  const result = await mod.requestPermissionsAsync();
  return result.granted;
}

/**
 * Start continuous on-device speech recognition.
 *
 * Uses interimResults so we get partial transcripts for responsiveness,
 * but only fires onResult with the final transcript.
 * Auto-restarts when iOS ends the session (silence timeout).
 */
export function startListening(
  onResult: STTResultCallback,
  onError: STTErrorCallback,
  onEnd?: () => void,
): void {
  const mod = getSTTModule();
  if (!mod) {
    onError('Speech recognition is not available. Use a development build (npx expo run:ios).');
    return;
  }

  removeListeners();

  sttResultListener = mod.addListener('result', (event: any) => {
    if (event.isFinal) {
      const transcript = event.results?.[0]?.transcript;
      if (transcript?.trim()) {
        onResult(transcript.trim());
      }
    }
  });

  sttErrorListener = mod.addListener('error', (event: any) => {
    const code = event.error;
    // These are not real errors — silence or speech timeout, just let onEnd restart
    if (code === 'no-speech' || code === 'speech-timeout') return;
    onError(event.message ?? event.error ?? 'Speech recognition error');
  });

  sttEndListener = mod.addListener('end', () => {
    onEnd?.();
  });

  mod.start({
    lang: 'en-US',
    interimResults: false,
    continuous: true,
    requiresOnDeviceRecognition: false,
  });
}

/**
 * Stop speech recognition and remove all listeners.
 */
export function stopListening(): void {
  const mod = getSTTModule();
  try {
    mod?.stop();
  } catch {
    // ignore if not running
  }
  removeListeners();
}

function removeListeners(): void {
  sttResultListener?.remove();
  sttErrorListener?.remove();
  sttEndListener?.remove();
  sttResultListener = null;
  sttErrorListener = null;
  sttEndListener = null;
}

/**
 * Briefly pause recognition (e.g., while TTS is speaking).
 */
export function pauseListening(): void {
  const mod = getSTTModule();
  try {
    mod?.stop();
  } catch {
    // ignore
  }
}

export function resumeListening(
  onResult: STTResultCallback,
  onError: STTErrorCallback,
  onEnd?: () => void,
): void {
  startListening(onResult, onError, onEnd);
}

// ---------------------------------------------------------------------------
// Text-to-Speech
// ---------------------------------------------------------------------------

let ttsOnDoneCallback: (() => void) | null = null;

/**
 * Speak text aloud via the device TTS engine.
 * onDone fires when speech finishes (or is stopped).
 */
export function speak(text: string, onDone?: () => void): void {
  ttsOnDoneCallback = onDone ?? null;
  Speech.speak(text, {
    language: 'en-US',
    rate: 0.95,
    onDone: () => {
      ttsOnDoneCallback?.();
      ttsOnDoneCallback = null;
    },
    onStopped: () => {
      ttsOnDoneCallback?.();
      ttsOnDoneCallback = null;
    },
    onError: () => {
      ttsOnDoneCallback?.();
      ttsOnDoneCallback = null;
    },
  });
}

/**
 * Stop any currently playing TTS immediately.
 */
export function stopSpeaking(): void {
  Speech.stop();
  ttsOnDoneCallback = null;
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
