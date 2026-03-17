import type {
  DailyGoal,
  UpdateGoalsRequest,
  FoodEntry,
  CreateFoodEntryRequest,
  UpdateFoodEntryRequest,
  CustomFood,
  CreateCustomFoodRequest,
  UpdateCustomFoodRequest,
  CommunityFood,
  CreateCommunityFoodRequest,
  PublishCustomFoodRequest,
  UnifiedSearchResponse,
  FrequentFood,
  RecentFood,
  UserProfile,
  UserPreferences,
  GoalForDateResponse,
  GoalProfilesResponse,
  UpdateGoalsForDateRequest,
  FoodUnitConversion,
  CreateFoodUnitConversionRequest,
  UpdateFoodUnitConversionRequest,
  CascadeUnitConversionsRequest,
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

export class ApiError extends Error {
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
    let message = body || `Request failed: ${res.status}`;
    try {
      const parsed = body ? JSON.parse(body) : null;
      if (parsed && typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // use raw body as message
    }
    throw new ApiError(res.status, message);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : (null as T);
}

// --- Goals ---

export async function getGoalsForDate(date: string): Promise<GoalForDateResponse> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return request<GoalForDateResponse>(`/api/goals${qs}`);
}

export async function changeGoals(
  data: UpdateGoalsForDateRequest,
): Promise<GoalForDateResponse> {
  return request<GoalForDateResponse>('/api/goals/change', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getGoalProfiles(): Promise<GoalProfilesResponse> {
  return request<GoalProfilesResponse>('/api/goal-profiles');
}

// --- Profile ---

export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/api/profile');
}

export async function updateProfile(profile: UserProfile): Promise<UserProfile> {
  return request<UserProfile>('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

// --- User Preferences ---

export async function getUserPreferences(): Promise<UserPreferences> {
  return request<UserPreferences>('/api/user/preferences');
}

export async function updateUserPreferences(
  data: Partial<UserPreferences>,
): Promise<UserPreferences> {
  return request<UserPreferences>('/api/user/preferences', {
    method: 'PATCH',
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

// --- Community Foods ---

export async function createCommunityFood(
  data: CreateCommunityFoodRequest,
): Promise<CommunityFood> {
  return request<CommunityFood>('/api/food/community', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function publishCustomFood(
  id: string,
  data: PublishCustomFoodRequest,
): Promise<CommunityFood> {
  try {
    return await request<CommunityFood>(`/api/food/custom/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      throw new ApiError(429, "You've published too many foods today. Try again tomorrow.");
    }
    throw e;
  }
}

// --- Search ---

export async function searchFoods(query: string): Promise<UnifiedSearchResponse> {
  return request<UnifiedSearchResponse>(
    `/api/food/search?q=${encodeURIComponent(query)}`,
  );
}

// --- Per-food unit conversions ---

export async function getFoodUnitConversionsForCustomFood(
  customFoodId: string,
): Promise<FoodUnitConversion[]> {
  return request<FoodUnitConversion[]>(
    `/api/food/units?customFoodId=${encodeURIComponent(customFoodId)}`,
  );
}

export async function getFoodUnitConversionsForUsdaFood(
  usdaFdcId: number,
): Promise<FoodUnitConversion[]> {
  return request<FoodUnitConversion[]>(
    `/api/food/units?usdaFdcId=${encodeURIComponent(String(usdaFdcId))}`,
  );
}

export async function createFoodUnitConversion(
  data: CreateFoodUnitConversionRequest,
): Promise<FoodUnitConversion> {
  return request<FoodUnitConversion>('/api/food/units', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFoodUnitConversion(
  id: string,
  data: UpdateFoodUnitConversionRequest,
): Promise<FoodUnitConversion> {
  return request<FoodUnitConversion>(`/api/food/units/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteFoodUnitConversion(id: string): Promise<void> {
  return request<void>(`/api/food/units/${id}`, { method: 'DELETE' });
}

export async function cascadeUnitConversions(
  data: CascadeUnitConversionsRequest,
): Promise<void> {
  return request<void>('/api/food/units/cascade', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// --- Barcode lookup ---

export async function lookupBarcode(
  code: string,
): Promise<CommunityFood | null> {
  const result = await request<{ food: CommunityFood | null }>(
    `/api/barcode/lookup?code=${encodeURIComponent(code)}`,
  );
  return result.food;
}

// --- Community Food Reporting ---

export async function reportCommunityFood(
  id: string,
  reason: string,
  details?: string,
): Promise<void> {
  await request<{ reported: boolean }>(`/api/food/community/${id}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, details }),
  });
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
