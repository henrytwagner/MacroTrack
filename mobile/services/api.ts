import type {
  DailyGoal,
  UpdateGoalsRequest,
  FoodEntry,
  CreateFoodEntryRequest,
  UpdateFoodEntryRequest,
  CustomFood,
  CreateCustomFoodRequest,
  UpdateCustomFoodRequest,
  UnifiedSearchResponse,
  FrequentFood,
  RecentFood,
} from '@shared/types';
import type { BarcodeScanResult } from '@/features/barcode/types';
import { Platform } from 'react-native';

// For physical device: set EXPO_PUBLIC_API_HOST to your Mac's LAN IP (e.g. 192.168.1.x) so the app can reach the server.
const DEV_HOST =
  process.env.EXPO_PUBLIC_API_HOST ||
  (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
const BASE_URL = __DEV__
  ? `http://${DEV_HOST}:3000`
  : 'https://api.macrotrack.app';

/** In dev, use this to show which server URL the app is using (for connection troubleshooting). */
export function getApiBaseUrl(): string {
  return BASE_URL;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = (options.method ?? 'GET').toUpperCase();
  const hasBody = options.body != null && options.body !== '';
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[API] ${method} ${url}`);
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[API] ${method} ${path} → ${res.status}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `Request failed: ${res.status}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : (null as T);
}

// --- Goals ---

export async function getGoals(): Promise<DailyGoal | null> {
  return request<DailyGoal | null>('/api/goals');
}

export async function updateGoals(data: UpdateGoalsRequest): Promise<DailyGoal> {
  return request<DailyGoal>('/api/goals', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// --- Food Entries ---

export async function getEntries(date: string): Promise<FoodEntry[]> {
  return request<FoodEntry[]>(`/api/food/entries?date=${date}`);
}

export async function createEntry(data: CreateFoodEntryRequest): Promise<FoodEntry> {
  return request<FoodEntry>('/api/food/entries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEntry(
  id: string,
  data: UpdateFoodEntryRequest,
): Promise<FoodEntry> {
  return request<FoodEntry>(`/api/food/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  return request<void>(`/api/food/entries/${id}`, { method: 'DELETE' });
}

export async function getFrequentFoods(): Promise<FrequentFood[]> {
  return request<FrequentFood[]>('/api/food/entries/frequent');
}

export async function getRecentFoods(): Promise<RecentFood[]> {
  return request<RecentFood[]>('/api/food/entries/recent');
}

// --- Custom Foods ---

export async function getCustomFoods(): Promise<CustomFood[]> {
  return request<CustomFood[]>('/api/food/custom');
}

export async function createCustomFood(
  data: CreateCustomFoodRequest,
): Promise<CustomFood> {
  return request<CustomFood>('/api/food/custom', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCustomFood(
  id: string,
  data: UpdateCustomFoodRequest,
): Promise<CustomFood> {
  return request<CustomFood>(`/api/food/custom/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCustomFood(id: string): Promise<void> {
  return request<void>(`/api/food/custom/${id}`, { method: 'DELETE' });
}

// --- Search ---

export async function searchFoods(query: string): Promise<UnifiedSearchResponse> {
  return request<UnifiedSearchResponse>(
    `/api/food/search?q=${encodeURIComponent(query)}`,
  );
}

// --- Barcode (image upload for iOS) ---

/**
 * Upload an image to the server for barcode decoding. Used on iOS for "Upload image"
 * when expo-camera does not support product barcodes from images.
 */
export async function uploadImageForBarcodeScan(
  uri: string,
  type?: string,
  name?: string,
): Promise<BarcodeScanResult | null> {
  const formData = new FormData();
  formData.append('image', {
    uri,
    type: type ?? 'image/jpeg',
    name: name ?? 'image.jpg',
  } as unknown as Blob);
  try {
    const res = await fetch(`${BASE_URL}/api/barcode/scan`, {
      method: 'POST',
      body: formData,
      headers: {
        // Do not set Content-Type; let the runtime set multipart/form-data with boundary.
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { gtin?: string; raw?: string; format?: string } | null;
    if (!json?.gtin || !json?.raw || !json?.format) return null;
    return { gtin: json.gtin, raw: json.raw, format: json.format };
  } catch {
    return null;
  }
}
