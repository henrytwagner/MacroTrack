import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ScaleReadingCard } from '@/features/scale/ScaleReadingCard';
import { startSimulation, startRemoveSimulation } from '@/features/scale/simulate';
import type { ScaleDevice, ScaleReading, ScaleSessionState } from '@/features/scale/types';

export default function ScaleDemoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  const [sessionState, setSessionState] = useState<ScaleSessionState>('idle');
  const [devices, setDevices] = useState<ScaleDevice[]>([]);
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bleCleanupRef = useRef<(() => void) | null>(null);
  const simCleanupRef = useRef<(() => void) | null>(null);

  function stopAllActivity() {
    bleCleanupRef.current?.();
    bleCleanupRef.current = null;
    simCleanupRef.current?.();
    simCleanupRef.current = null;
  }

  useEffect(() => {
    return () => {
      // Only cancel active scans/subscriptions on unmount.
      // Do NOT destroy the BleManager — iOS CBCentralManager takes several seconds
      // to re-initialize after destroy(), causing "Bluetooth did not become ready"
      // errors on re-entry. The singleton lives for the app session lifetime.
      stopAllActivity();
    };
  }, []);

  async function handleScan() {
    if (Platform.OS === 'web') return;
    stopAllActivity();
    setReading(null);
    setIsSimulated(false);
    setDevices([]);
    setError(null);
    setSessionState('scanning');

    try {
      const { scanForScales } = await import('@/features/scale/ble');
      const result = await scanForScales(8000);

      if (result.status === 'found') {
        setDevices(result.devices);
        setSessionState('found_devices');
      } else if (result.status === 'no_devices') {
        setError('No Etekcity scales found nearby. Make sure the scale is powered on.');
        setSessionState('error');
      } else if (result.status === 'permission_denied') {
        setError('Bluetooth permission denied. Please allow Bluetooth access in Settings.');
        setSessionState('error');
      } else if (result.status === 'bluetooth_off') {
        setError('Bluetooth is turned off. Please enable Bluetooth and try again.');
        setSessionState('error');
      } else {
        setError(result.message);
        setSessionState('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected BLE error');
      setSessionState('error');
    }
  }

  async function handleConnect(device: ScaleDevice) {
    if (Platform.OS === 'web') return;
    stopAllActivity();
    setError(null);
    setSessionState('connecting');

    const { connectAndSubscribe } = await import('@/features/scale/ble');
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
  }

  function handleDisconnect() {
    stopAllActivity();
    setReading(null);
    setSessionState('idle');
  }

  function handleSimulate() {
    stopAllActivity();
    setReading(null);
    setError(null);
    setIsSimulated(true);
    setSessionState('connected' as ScaleSessionState);

    // Use 'simulating' as a conceptual sub-state; we reuse 'connected' for display
    // but track simulation separately via isSimulated
    const cleanup = startSimulation((r) => setReading(r));
    simCleanupRef.current = cleanup;
  }

  function handlePlaceItem() {
    simCleanupRef.current?.();
    const cleanup = startSimulation((r) => setReading(r));
    simCleanupRef.current = cleanup;
  }

  function handleRemoveItem() {
    simCleanupRef.current?.();
    const currentValue = reading?.value ?? 200;
    const cleanup = startRemoveSimulation(
      currentValue,
      (r) => setReading(r),
      () => setReading(null),
    );
    simCleanupRef.current = cleanup;
  }

  function handleStopSimulation() {
    stopAllActivity();
    setReading(null);
    setIsSimulated(false);
    setSessionState('idle');
  }

  function handleCancelScan() {
    stopAllActivity();
    setSessionState('idle');
  }

  const stateLabel: Record<ScaleSessionState, string> = {
    idle: 'Ready',
    requesting_permission: 'Requesting permission…',
    scanning: 'Scanning for devices…',
    connecting: 'Connecting…',
    connected: isSimulated ? 'Simulating' : 'Connected',
    error: 'Error',
  };

  const stateBadgeColor: Record<ScaleSessionState, string> = {
    idle: colors.textSecondary + '30',
    requesting_permission: colors.tint + '20',
    scanning: colors.tint + '20',
    connecting: colors.tint + '20',
    connected: colors.tint + '20',
    error: colors.destructive + '20',
  };

  const stateLabelColor: Record<ScaleSessionState, string> = {
    idle: colors.textSecondary,
    requesting_permission: colors.tint,
    scanning: colors.tint,
    connecting: colors.tint,
    connected: colors.tint,
    error: colors.destructive,
  };

  const isConnectedOrSimulating = sessionState === 'connected';

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.centeredContent}>
          <ThemedText style={[Typography.title2, { color: colors.text }]}>Scale demo</ThemedText>
          <ThemedText style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Bluetooth is not supported on web.
          </ThemedText>
          <ThemedText
            style={[Typography.footnote, { color: colors.textTertiary, marginTop: Spacing.lg }]}
            onPress={() => router.back()}
          >
            Tap here or use system back to close.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Scale demo
        </ThemedText>
        <ThemedText style={[Typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          Connect to your Etekcity ESN00 smart nutrition scale via Bluetooth, or use Simulate mode to test without hardware.
        </ThemedText>

        {/* State badge */}
        <View style={[styles.stateBadge, { backgroundColor: stateBadgeColor[sessionState] }]}>
          {(sessionState === 'scanning' || sessionState === 'connecting' || sessionState === 'requesting_permission') && (
            <ActivityIndicator size="small" color={colors.tint} style={{ marginRight: Spacing.xs }} />
          )}
          <ThemedText
            style={[Typography.footnote, { color: stateLabelColor[sessionState], fontWeight: '600' }]}
          >
            {stateLabel[sessionState]}
          </ThemedText>
        </View>

        {/* Error message */}
        {error != null && (
          <ThemedText style={[Typography.footnote, { color: colors.destructive, textAlign: 'center' }]}>
            {error}
          </ThemedText>
        )}

        {/* Device list */}
        {sessionState === 'found_devices' && devices.length > 0 && (
          <View style={[styles.deviceList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              Found {devices.length} device{devices.length !== 1 ? 's' : ''}
            </ThemedText>
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />
              )}
              renderItem={({ item }) => (
                <View style={styles.deviceRow}>
                  <View style={styles.deviceInfo}>
                    <ThemedText style={[Typography.headline, { color: colors.text }]}>
                      {item.name}
                    </ThemedText>
                    <ThemedText style={[Typography.caption1, { color: colors.textTertiary }]}>
                      RSSI {item.rssi} dBm
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.connectButton, { backgroundColor: colors.tint }]}
                    onPress={() => handleConnect(item)}
                  >
                    <ThemedText style={[Typography.footnote, { color: '#fff', fontWeight: '600' }]}>
                      Connect
                    </ThemedText>
                  </Pressable>
                </View>
              )}
            />
          </View>
        )}

        {/* Scale reading card */}
        {isConnectedOrSimulating && reading != null && (
          <ScaleReadingCard reading={reading} isSimulated={isSimulated} />
        )}
        {isConnectedOrSimulating && reading == null && (
          <View style={[styles.waitingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.tint} />
            <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
              {isSimulated ? 'Starting simulation…' : 'Waiting for scale data…'}
            </ThemedText>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {(sessionState === 'idle' || sessionState === 'error') && (
            <>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleScan}
              >
                <ThemedText style={[styles.buttonText, { color: '#fff' }]}>Scan for scale</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
                onPress={handleSimulate}
              >
                <ThemedText style={[styles.buttonText, { color: colors.text }]}>Simulate</ThemedText>
              </Pressable>
            </>
          )}

          {sessionState === 'scanning' && (
            <Pressable
              style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
              onPress={handleCancelScan}
            >
              <ThemedText style={[styles.buttonText, { color: colors.text }]}>Cancel</ThemedText>
            </Pressable>
          )}

          {sessionState === 'found_devices' && (
            <>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleScan}
              >
                <ThemedText style={[styles.buttonText, { color: '#fff' }]}>Scan again</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
                onPress={handleSimulate}
              >
                <ThemedText style={[styles.buttonText, { color: colors.text }]}>Simulate</ThemedText>
              </Pressable>
            </>
          )}

          {sessionState === 'connecting' && (
            <View style={styles.connectingRow}>
              <ActivityIndicator color={colors.tint} />
              <ThemedText style={[Typography.footnote, { color: colors.textSecondary }]}>
                Connecting to scale…
              </ThemedText>
            </View>
          )}

          {isConnectedOrSimulating && (
            <>
              {isSimulated ? (
                <>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.tint }]}
                    onPress={handlePlaceItem}
                  >
                    <ThemedText style={[styles.buttonText, { color: '#fff' }]}>Place item</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={handleRemoveItem}
                  >
                    <ThemedText style={[styles.buttonText, { color: colors.text }]}>Remove item</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '40', borderWidth: 1 }]}
                    onPress={handleStopSimulation}
                  >
                    <ThemedText style={[styles.buttonText, { color: colors.destructive }]}>Stop</ThemedText>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '40', borderWidth: 1 }]}
                    onPress={handleDisconnect}
                  >
                    <ThemedText style={[styles.buttonText, { color: colors.destructive }]}>Disconnect</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => { handleDisconnect(); handleSimulate(); }}
                  >
                    <ThemedText style={[styles.buttonText, { color: colors.text }]}>Simulate</ThemedText>
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>

        {/* Protocol transparency note */}
        <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText style={[Typography.caption1, { color: colors.textSecondary, fontWeight: '600', marginBottom: Spacing.xs }]}>
            About BLE protocol
          </ThemedText>
          <ThemedText style={[Typography.caption2, { color: colors.textTertiary }]}>
            The Etekcity ESN00 uses a proprietary BLE protocol. Weight data is read from characteristic 00002c12 and parsed from raw bytes. The raw hex packet is always shown above for transparency. oz parsing for large weights (bytes[9] as whole-oz) is unconfirmed.
          </ThemedText>
        </View>

        {/* Close link */}
        <ThemedText
          style={[Typography.footnote, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.md }]}
          onPress={() => router.back()}
        >
          Tap here or use system back to close.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
    alignItems: 'center',
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  deviceList: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  deviceInfo: { flex: 1, gap: 2 },
  connectButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.xs,
  },
  waitingCard: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
  },
  button: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  buttonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  noteCard: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
});
