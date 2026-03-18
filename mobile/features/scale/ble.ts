import { BleManager, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import type { ScaleDevice, ScaleReading, ScaleScanResult, ScaleUnit } from './types';

// Confirmed from nRF Connect attribute table on Etekcity ESN00
const WEIGHT_CHARACTERISTIC_UUID = '00002c12-0000-1000-8000-00805f9b34fb';

// Scale device name patterns (confirmed: device advertises as "Etekcity Nutrition Scale")
const SCALE_NAME_PATTERN = /esn00|etekcity|eteksca/i;

let _manager: BleManager | null = null;

function getManager(): BleManager {
  if (_manager == null) {
    _manager = new BleManager();
  }
  return _manager;
}

export function destroyBleManager(): void {
  if (_manager != null) {
    _manager.destroy();
    _manager = null;
  }
}

export function parseWeightFromBytes(base64: string): ScaleReading | null {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0xfe || bytes[1] !== 0xef) return null;

  const rawHex = Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');

  const stable = bytes[4] === 0xd0 && bytes[5] === 0x05;
  const unitByte = bytes[7];

  let unit: ScaleUnit;
  let value: number;
  let display: string;

  if (unitByte === 0x00) {
    unit = 'g';
    value = ((bytes[8] | (bytes[9] << 8)) >>> 0) / 10.0;
    display = `${value.toFixed(1)} g`;
  } else if (unitByte === 0x04) {
    unit = 'ml';
    value = ((bytes[8] | (bytes[9] << 8)) >>> 0) / 10.0;
    display = `${value.toFixed(1)} ml`;
  } else if (unitByte === 0x06) {
    unit = 'oz';
    value = ((bytes[8] | (bytes[9] << 8)) >>> 0) / 100.0;
    display = `${value.toFixed(2)} oz`;
  } else if (unitByte === 0x01) {
    unit = 'lb:oz';
    const lbs = bytes[9];
    const oz = bytes[8] / 100.0;
    value = lbs + oz / 16;
    display = `${lbs} lb ${oz.toFixed(2)} oz`;
  } else {
    unit = 'g';
    value = ((bytes[8] | (bytes[9] << 8)) >>> 0) / 10.0;
    display = `${value.toFixed(1)} g`;
  }

  return { value, unit, display, stable, rawHex };
}

// Wait for CBCentralManager to leave Unknown/Resetting before scanning.
// Uses onStateChange which works reliably on Old Architecture (bridge events).
// Subscribe BEFORE checking state to avoid missing a transition that occurs
// between the state() call and the subscription being registered.
function waitForPoweredOn(manager: BleManager): Promise<ScaleScanResult | null> {
  return new Promise((resolve) => {
    const tid = setTimeout(() => {
      sub.remove();
      resolve({ status: 'error', message: 'Bluetooth did not become ready in time' });
    }, 8000);

    const sub = manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        clearTimeout(tid);
        sub.remove();
        resolve(null); // null = proceed with scan
      } else if (state === State.PoweredOff) {
        clearTimeout(tid);
        sub.remove();
        resolve({ status: 'bluetooth_off' });
      } else if (state === State.Unauthorized) {
        clearTimeout(tid);
        sub.remove();
        resolve({ status: 'permission_denied' });
      } else if (state === State.Unsupported) {
        clearTimeout(tid);
        sub.remove();
        resolve({ status: 'error', message: 'Bluetooth not supported on this device' });
      }
      // Unknown / Resetting: keep waiting
    }, true); // emitCurrentValue: true — fires immediately if already PoweredOn
  });
}

export async function scanForScales(timeoutMs = 15000): Promise<ScaleScanResult> {
  const manager = getManager();

  const notReady = await waitForPoweredOn(manager);
  if (notReady != null) return notReady;

  return new Promise<ScaleScanResult>((resolve) => {
    const found = new Map<string, ScaleDevice>();

    const timeoutId = setTimeout(() => {
      manager.stopDeviceScan();
      if (found.size === 0) {
        resolve({ status: 'no_devices' });
      } else {
        resolve({ status: 'found', devices: Array.from(found.values()) });
      }
    }, timeoutMs);

    // null service filter: scan all devices. The service UUID filter triggers the
    // library's JS-side state guard (which always fails with New Architecture).
    // Name filtering in the callback is sufficient for the ESN00.
    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        clearTimeout(timeoutId);
        manager.stopDeviceScan();
        const msg = error.message ?? String(error);
        if (msg.toLowerCase().includes('unauthorized') || error.errorCode === 5) {
          resolve({ status: 'permission_denied' });
        } else {
          resolve({ status: 'error', message: msg });
        }
        return;
      }
      if (!device) return;
      const name = device.name ?? device.localName ?? '';
      if (SCALE_NAME_PATTERN.test(name)) {
        found.set(device.id, {
          id: device.id,
          name: name || device.id,
          rssi: device.rssi ?? -99,
        });
      }
    });
  });
}

export async function connectAndSubscribe(
  deviceId: string,
  onReading: (reading: ScaleReading) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  const manager = getManager();

  // CoreBluetooth caches recently-scanned peripherals, so connectToDevice
  // works reliably immediately after a scan without needing a re-scan.
  const connected = await manager.connectToDevice(deviceId, { timeout: 15000 });
  await connected.discoverAllServicesAndCharacteristics();

  const services = await connected.services();
  for (const service of services) {
    const characteristics = await service.characteristics();
    for (const char of characteristics) {
      if (char.uuid.toLowerCase() === WEIGHT_CHARACTERISTIC_UUID.toLowerCase() && char.isNotifiable) {
        const subscription = char.monitor((error, c) => {
          if (error) {
            onError(error.message ?? String(error));
            return;
          }
          if (!c?.value) return;
          const reading = parseWeightFromBytes(c.value);
          if (reading != null) onReading(reading);
        });
        return () => {
          subscription.remove();
          manager.cancelDeviceConnection(deviceId).catch(() => {});
        };
      }
    }
  }

  await manager.cancelDeviceConnection(deviceId).catch(() => {});
  throw new Error('Weight characteristic (00002C12) not found — unexpected device layout');
}
