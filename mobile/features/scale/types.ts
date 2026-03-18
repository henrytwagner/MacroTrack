export type ScaleUnit = 'g' | 'ml' | 'oz' | 'lb:oz';

export type ScaleSessionState =
  | 'idle'
  | 'requesting_permission'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

export type ScaleReading = {
  value: number;
  unit: ScaleUnit;
  display: string;
  stable: boolean;
  rawHex: string;
};

export type ScaleDevice = {
  id: string;
  name: string;
  rssi: number;
};

export type ScaleScanResult =
  | { status: 'found'; devices: ScaleDevice[] }
  | { status: 'no_devices' | 'permission_denied' | 'bluetooth_off' }
  | { status: 'error'; message: string };
