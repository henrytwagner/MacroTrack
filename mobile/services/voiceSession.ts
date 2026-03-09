import { Platform } from 'react-native';
import type { WSClientMessage, WSServerMessage } from '@shared/types';

// ---------------------------------------------------------------------------
// WebSocket URL derivation (mirrors api.ts BASE_URL but uses ws:// / wss://)
// ---------------------------------------------------------------------------

const DEV_HOST =
  process.env.EXPO_PUBLIC_API_HOST ||
  (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');

const WS_BASE = __DEV__
  ? `ws://${DEV_HOST}:3000`
  : 'wss://api.macrotrack.app';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WSMessageCallback = (message: WSServerMessage) => void;
export type WSDisconnectCallback = () => void;

// ---------------------------------------------------------------------------
// Voice session client
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let onMessageCallback: WSMessageCallback | null = null;
let onDisconnectCallback: WSDisconnectCallback | null = null;

/**
 * Connect to the backend voice session WebSocket.
 *
 * @param date  The session date in YYYY-MM-DD format (entries will be logged to this date).
 * @param onMessage  Called whenever the server sends a parsed result message.
 * @param onDisconnect  Called if the connection drops unexpectedly.
 */
export function connect(
  date: string,
  onMessage: WSMessageCallback,
  onDisconnect: WSDisconnectCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    onMessageCallback = onMessage;
    onDisconnectCallback = onDisconnect;

    const url = `${WS_BASE}/ws/voice-session?date=${encodeURIComponent(date)}`;
    ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timed out'));
    }, 10_000);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };

    ws.onerror = (event) => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed'));
      console.error('[voiceSession] WebSocket error:', event);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WSServerMessage;
        onMessageCallback?.(msg);
      } catch (e) {
        console.error('[voiceSession] Failed to parse message:', e);
      }
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      // Only fire disconnect if not a clean intentional close
      if (event.code !== 1000) {
        onDisconnectCallback?.();
      }
      ws = null;
    };
  });
}

/**
 * Send a transcript segment to the server for parsing.
 */
export function sendTranscript(text: string): void {
  sendMessage({ type: 'transcript', text });
}

/**
 * Tell the server to save all draft items and end the session.
 */
export function sendSave(): void {
  sendMessage({ type: 'save' });
}

/**
 * Tell the server to discard all draft items and cancel the session.
 */
export function sendCancel(): void {
  sendMessage({ type: 'cancel' });
}

/**
 * Close the WebSocket connection cleanly (code 1000).
 * Call this after save/cancel completes so the server's onclose
 * handler knows it was intentional.
 */
export function disconnect(): void {
  if (ws) {
    ws.close(1000, 'Session ended');
    ws = null;
  }
  onMessageCallback = null;
  onDisconnectCallback = null;
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

function sendMessage(msg: WSClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.warn('[voiceSession] Attempted to send on closed socket:', msg.type);
  }
}
