import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { startSimulation } from './simulate';
import type { ScaleReading, ScaleSessionState } from './types';

export type UseScaleReturn = {
  sessionState: ScaleSessionState;
  reading: ScaleReading | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  simulate: () => void;
  cancelScan: () => void;
};

export function useScale(): UseScaleReturn {
  const [sessionState, setSessionState] = useState<ScaleSessionState>('idle');
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bleCleanupRef = useRef<(() => void) | null>(null);
  const simCleanupRef = useRef<(() => void) | null>(null);
  // Flag to ignore scan results after cancelScan() is called
  const scanCancelledRef = useRef(false);

  function stopAllActivity() {
    bleCleanupRef.current?.();
    bleCleanupRef.current = null;
    simCleanupRef.current?.();
    simCleanupRef.current = null;
  }

  useEffect(() => {
    return () => {
      // Cancel active scans/subscriptions on unmount.
      // Do NOT destroy BleManager — iOS CBCentralManager takes several seconds
      // to re-initialize after destroy(), causing errors on re-entry.
      stopAllActivity();
    };
  }, []);

  async function connect() {
    if (Platform.OS === 'web') return;
    stopAllActivity();
    setReading(null);
    setError(null);
    scanCancelledRef.current = false;
    setSessionState('scanning');

    try {
      const { scanForScales, connectAndSubscribe } = await import('./ble');
      const result = await scanForScales(8000);

      if (scanCancelledRef.current) return;

      if (result.status === 'found') {
        const device = result.devices[0];
        setSessionState('connecting');
        try {
          const cleanup = await connectAndSubscribe(
            device.id,
            (r) => setReading(r),
            (msg) => {
              setError(msg);
              setSessionState('error');
            },
          );
          bleCleanupRef.current = cleanup;
          setSessionState('connected');
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setSessionState('error');
        }
      } else if (result.status === 'no_devices') {
        setError('No Etekcity scales found nearby.');
        setSessionState('error');
      } else if (result.status === 'permission_denied') {
        setError('Bluetooth permission denied. Allow access in Settings.');
        setSessionState('error');
      } else if (result.status === 'bluetooth_off') {
        setError('Bluetooth is off. Enable it and try again.');
        setSessionState('error');
      } else {
        setError((result as { status: 'error'; message: string }).message ?? 'Unknown error');
        setSessionState('error');
      }
    } catch (e) {
      if (!scanCancelledRef.current) {
        setError(e instanceof Error ? e.message : 'Unexpected BLE error');
        setSessionState('error');
      }
    }
  }

  function disconnect() {
    stopAllActivity();
    setReading(null);
    setSessionState('idle');
  }

  function simulate() {
    stopAllActivity();
    setReading(null);
    setError(null);
    setSessionState('connected');
    const cleanup = startSimulation((r) => setReading(r));
    simCleanupRef.current = cleanup;
  }

  function cancelScan() {
    scanCancelledRef.current = true;
    stopAllActivity();
    setSessionState('idle');
  }

  return { sessionState, reading, error, connect, disconnect, simulate, cancelScan };
}
