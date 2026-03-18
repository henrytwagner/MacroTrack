import * as speech from './speech';

export type STTMode = 'local' | 'cloud';

export interface STTCallbacks {
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  onEnd?: () => void;
  /** Optional: live partial transcript (dev only, to confirm mic/audio). */
  onInterimResult?: (transcript: string) => void;
}

export interface STTStrategy {
  mode: STTMode;
  start(callbacks: STTCallbacks): void;
  stop(): void;
  pause(): void;
  resume(callbacks: STTCallbacks): void;
}

function getConfiguredMode(): STTMode {
  const mode = process.env.EXPO_PUBLIC_STT_MODE;
  return mode === 'cloud' ? 'cloud' : 'local';
}

function createLocalStrategy(): STTStrategy {
  return {
    mode: 'local',
    start({ onResult, onError, onEnd, onInterimResult }: STTCallbacks) {
      speech.startListening(onResult, onError, onEnd, onInterimResult);
    },
    stop() {
      speech.stopListening();
    },
    pause() {
      speech.pauseListening();
    },
    resume({ onResult, onError, onEnd, onInterimResult }: STTCallbacks) {
      speech.resumeListening(onResult, onError, onEnd, onInterimResult);
    },
  };
}

function createCloudStrategy(): STTStrategy {
  // Placeholder implementation: until cloud STT is wired up end-to-end,
  // fall back to local STT so Kitchen Mode continues to function.
  const fallback = createLocalStrategy();

  return {
    mode: 'cloud',
    start(callbacks: STTCallbacks) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(
          '[STT] Cloud STT mode selected, but CloudSTTStrategy is not fully implemented yet. Falling back to local STT.',
        );
      }
      fallback.start(callbacks);
    },
    stop() {
      fallback.stop();
    },
    pause() {
      fallback.pause();
    },
    resume(callbacks: STTCallbacks) {
      fallback.resume(callbacks);
    },
  };
}

export function createSTTStrategy(): STTStrategy {
  const mode = getConfiguredMode();
  if (mode === 'cloud') {
    return createCloudStrategy();
  }
  return createLocalStrategy();
}

