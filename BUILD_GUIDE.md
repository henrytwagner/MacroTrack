# MacroTrack — Build Guide

Step-by-step implementation guide for building MacroTrack in Cursor. Each session is a focused Cursor conversation. Start a new chat for each session and reference the relevant spec sections.

**Prerequisites**: Node.js 20+, PostgreSQL running locally, Google Gemini API key.

---

## Session 1 — Scaffold + Database (Phases 1-2)

**Goal**: Monorepo skeleton with both projects building, database schema ready.

**Prompt Cursor with**:
> Build Phase 1-2 from SPEC.md. Scaffold the monorepo: an Expo app in `mobile/` and a Fastify server in `server/`. Both use TypeScript. The shared types are already in `shared/types.ts`. Set up Prisma with the schema from SPEC.md Section 9. Configure both projects to import from `shared/`. Verify both build.

**What gets built**:
- `mobile/` — Expo app via `create-expo-app`, Expo Router, 3-tab navigation shell (Dashboard, Log, Goals) with placeholder screens
- `server/` — Fastify + TypeScript, Prisma ORM, PostgreSQL connection
- `server/src/db/prisma/schema.prisma` — User, DailyGoal, FoodEntry, CustomFood, VoiceSession models
- TypeScript path aliases so both `mobile/` and `server/` can `import { ... } from '@shared/types'`
- `.env` file for database URL and API keys (gitignored)

**Validate**:
- `cd mobile && npx expo start` launches without errors
- `cd server && npm run dev` starts the Fastify server
- `npx prisma migrate dev` creates the database tables
- Tab navigation works in the Expo app (3 placeholder screens)

**Commit**: `git init && git add -A && git commit -m "scaffold monorepo with Expo app, Fastify server, and Prisma schema"`

---

## Session 2 — USDA Service (Phase 3)

**Goal**: Working USDA FoodData Central client that can search and return structured nutrition data.

**Prompt Cursor with**:
> Build Phase 3 from SPEC.md. Create the USDA FoodData Central service in `server/src/services/usda.ts`. It should search by query via the USDA API, parse the nutrient response into our `Macros` type from `shared/types.ts`, and return results matching the `USDASearchResult` interface. Limit to 15 results. See SPEC.md Section 6.4 for search UX constraints.

**What gets built**:
- `server/src/services/usda.ts` — USDA FoodData Central API client
  - `searchFoods(query: string): Promise<USDASearchResult[]>`
  - Nutrient ID mapping (protein = 1003, fat = 1004, carbs = 1005, calories = 1008)
  - Error handling for API downtime

**Validate**:
- Write a quick test script or use the Fastify server to call `searchFoods("chicken breast")` and verify it returns structured results with macros
- Test with edge cases: empty query, no results, API timeout

**Commit**: `"add USDA FoodData Central search service"`

---

## Session 3 — Gemini Service + Food Parser (Phases 4-5)

**Goal**: Gemini parses natural language into structured intents, food parser orchestrates the full lookup pipeline.

**Prompt Cursor with**:
> Build Phases 4-5 from SPEC.md. Create the Gemini service in `server/src/services/gemini.ts` using the system prompt from `shared/prompts/system-prompt.ts` and the request builder from `shared/prompts/build-request.ts`. Use Gemini 2.0 Flash with JSON mode. Then build the food parser orchestrator in `server/src/services/foodParser.ts` that takes a transcript + context, calls Gemini, then looks up results: custom foods first, then USDA, then triggers voice-guided creation if no match. See SPEC.md Section 8 for AI behavior and the types in `shared/types.ts` for all intent shapes. Remember to coerce string values from Gemini (newValue, value) into proper types.

**What gets built**:
- `server/src/services/gemini.ts` — Gemini API client
  - `parseTranscript(context: GeminiRequestContext): Promise<GeminiIntent>`
  - Uses system prompt as system instruction, builds per-turn user message
  - JSON mode enabled, response parsed and coerced to proper types
- `server/src/services/foodParser.ts` — Orchestrator
  - `processTranscript(context): Promise<WSServerMessage>`
  - Lookup chain: custom food fuzzy match → USDA search → no-match (create food prompt)
  - Assigns meal label based on time of day (SPEC.md Section 8.5)

**Validate**:
- Call `parseTranscript` with test cases from `shared/prompts/test-cases.ts`
- Call `processTranscript` with "200 grams of chicken breast" and verify it returns a full `WSItemsAddedMessage` with USDA nutrition data
- Test no-match scenario: "Mom's chili" should return a `WSCreateFoodPromptMessage`

**Commit**: `"add Gemini food parser and lookup orchestrator"`

---

## Session 4 — REST API (Phase 6)

**Goal**: All REST endpoints working and tested.

**Prompt Cursor with**:
> Build Phase 6 from SPEC.md. Implement all REST routes from SPEC.md Section 10.1. Food entry CRUD in `server/src/routes/food.ts`, custom food CRUD in `server/src/routes/customFood.ts`, goals in `server/src/routes/goals.ts`. The unified search endpoint (`GET /api/food/search`) should query custom foods first, then USDA, and return a `UnifiedSearchResponse`. Also implement frequent and recent food endpoints. Register all routes in `server/src/app.ts`. Use Prisma for all database operations. Types are in `shared/types.ts`.

**What gets built**:
- `server/src/routes/goals.ts` — GET /api/goals, PUT /api/goals
- `server/src/routes/food.ts` — CRUD for entries, search, frequent, recent
- `server/src/routes/customFood.ts` — CRUD for custom foods
- Route registration in `server/src/app.ts`

**Validate**:
- Test every endpoint with curl or a REST client (Postman, Insomnia, or HTTPie)
- Create a goal, create a custom food, log an entry, search, edit, delete
- Verify unified search returns custom foods under "My Foods" and USDA under "Database"
- Verify frequent/recent endpoints return correct data after logging a few entries

**Commit**: `"add REST API: goals, food entries, custom foods, search"`

---

## Session 5 — Goals Screen + Shared Components (Phases 7-8)

**Goal**: First working mobile screen with end-to-end API connection, plus reusable bottom sheet components.

**Prompt Cursor with**:
> Build Phases 7-8 from SPEC.md. First, create an API client service in `mobile/services/api.ts` that wraps fetch for our REST endpoints. Then build the Goals screen (`mobile/app/(tabs)/goals.tsx`) with number inputs for calories, protein, carbs, fat and a save button. Then build the FoodDetailSheet and CreateFoodSheet components as full-height bottom sheets per SPEC.md Sections 5.5 and 5.6. Also build EditEntrySheet per Section 5.7. Use the theme constants from `mobile/constants/theme.ts` — define the color palette and typography there (minimal, clean, Apple Health aesthetic). Use Zustand for the goal store.

**What gets built**:
- `mobile/constants/theme.ts` — Colors, typography, spacing scale
- `mobile/services/api.ts` — Typed REST client
- `mobile/stores/goalStore.ts` — Zustand store for goals
- `mobile/app/(tabs)/goals.tsx` — Goals screen with numeric inputs
- `mobile/components/FoodDetailSheet.tsx` — Full-height bottom sheet (view/add/edit food)
- `mobile/components/CreateFoodSheet.tsx` — Full-height bottom sheet (create custom food)
- `mobile/components/EditEntrySheet.tsx` — Lightweight bottom sheet (edit entry)

**Validate**:
- Goals screen loads, user can enter values and tap Save
- Verify the save hits the backend and persists (check database or GET /api/goals)
- Open each bottom sheet component in isolation (temporary test buttons) to verify layout

**Commit**: `"add Goals screen, API client, theme, and bottom sheet components"`

---

## Session 6 — Dashboard (Phase 9)

**Goal**: The main home screen showing macro progress and daily food log.

**Prompt Cursor with**:
> Build Phase 9 from SPEC.md. Build the Dashboard screen (`mobile/app/(tabs)/index.tsx`) per SPEC.md Section 5.1. It needs: a DateHeader component with prev/next arrows and tappable date text for a date picker, macro progress bars (MacroProgressBar component) that overflow visually past 100% in a warning color, food entries grouped by meal (MealGroup + FoodEntryRow components) with swipe-to-delete (UndoSnackbar with 5-second undo) and tap-to-edit (opens EditEntrySheet). Create a dateStore and dailyLogStore in Zustand. The dailyLogStore fetches entries for the selected date from the API. See SPEC.md Sections 5.1, 6.1, 6.2 for the full behavior spec.

**What gets built**:
- `mobile/stores/dateStore.ts` — Selected date, defaults to today
- `mobile/stores/dailyLogStore.ts` — Entries for selected date, fetches from API
- `mobile/components/DateHeader.tsx` — Date display + navigation + picker
- `mobile/components/MacroProgressBar.tsx` — Progress bar with overflow state
- `mobile/components/MealGroup.tsx` — Meal header + entry list
- `mobile/components/FoodEntryRow.tsx` — Swipeable entry row
- `mobile/components/UndoSnackbar.tsx` — Temporary undo bar for deletes
- `mobile/app/(tabs)/index.tsx` — Dashboard screen

**Validate**:
- Dashboard shows progress bars reflecting goals (or dimmed state if no goals set)
- Date navigation works (prev/next, date picker)
- Manually log some entries via curl/REST client, verify they appear grouped by meal
- Swipe-to-delete works with undo snackbar
- Tap-to-edit opens EditEntrySheet, changes persist
- Overflow bars appear when exceeding a goal

**Commit**: `"add Dashboard with date navigation, macro progress, and food log"`

---

## Session 7 — Log Screen (Phase 10)

**Goal**: The food logging hub with search, frequent/recent foods, and custom food creation.

**Prompt Cursor with**:
> Build Phase 10 from SPEC.md. Build the Log screen (`mobile/app/(tabs)/log.tsx`) per SPEC.md Section 5.2. It needs: a search bar (300ms debounce, 2 char minimum) that queries the unified search endpoint and shows results grouped under "My Foods" and "Database" headers, a "Create Food" button and "My Foods" link, Frequent and Recent food sections (FrequentFoodRow component with two tap targets: name opens FoodDetailSheet, "+" instant-logs with haptic feedback), and a large mic button at bottom center (non-functional for now — just the UI). When viewing a past date, show "Logging to: [date]" indicator. Also build the CustomFoodList component (Section 5.9) for browsing all custom foods. See Section 6.4 for search UX details.

**What gets built**:
- `mobile/app/(tabs)/log.tsx` — Log screen
- `mobile/components/FoodSearchResult.tsx` — Search result row
- `mobile/components/FrequentFoodRow.tsx` — Frequent/recent row with "+" quick-add
- `mobile/components/CustomFoodList.tsx` — My Foods library (browse/edit/delete)
- Search integration with debounce and grouped results
- Quick-add "+" with haptic feedback
- Mic button (UI only, Kitchen Mode wired in Session 8)

**Validate**:
- Search returns grouped results (create some custom foods first via CreateFoodSheet)
- Tapping a food name opens FoodDetailSheet, tapping "+" instant-logs with haptic
- "Create Food" opens CreateFoodSheet, saving creates a searchable custom food
- "My Foods" link opens the custom food library
- No-results state shows "Create '[query]' as custom food" fallback
- Frequent and Recent sections populate after logging a few entries
- Date indicator appears when selected date is not today

**Commit**: `"add Log screen with search, frequent/recent, quick-add, and custom foods"`

---

## Session 8 — WebSocket + Kitchen Mode (Phases 11-12)

**Goal**: The full voice logging experience. This is the biggest session — consider splitting into two conversations if it gets too long.

### Part A — WebSocket Handler (Phase 11)

**Prompt Cursor with**:
> Build Phase 11 from SPEC.md. Create the WebSocket voice session handler in `server/src/websocket/voiceSession.ts`. It should: accept WebSocket connections at `/ws/voice-session`, maintain session state (normal vs creating:itemId), receive transcript messages, invoke the food parser orchestrator, and stream back WSServerMessage responses. Handle the full custom food creation state machine (confirm → servingSize → calories → protein → carbs → fat → complete). Handle save and cancel messages (save persists all draft items as FoodEntries, cancel rolls back entries AND any custom foods created during the session). Register the WebSocket handler in `server/src/app.ts`. See SPEC.md Sections 7 and 10.2 for the session state model and WebSocket protocol.

**Validate**:
- Connect to the WebSocket with a tool (wscat, Postman, or a quick test script)
- Send a transcript message, verify structured response comes back
- Test the full creation flow: send a food that doesn't match, confirm, provide each field
- Test save and cancel

### Part B — Kitchen Mode Screen (Phase 12)

**Prompt Cursor with**:
> Build Phase 12 from SPEC.md. Build the Kitchen Mode screen (`mobile/app/kitchen-mode.tsx`) as a full-screen modal per SPEC.md Section 5.3. It needs: MacroSummaryBar at top showing live projected totals, DraftMealCard components in the scrollable center (three states: normal, clarifying, creating), ListeningIndicator at bottom, Save and Cancel buttons. Wire up on-device STT via expo-speech-recognition with continuous listening and auto-segmentation. Connect to the backend WebSocket via the voiceSession service. TTS via Expo Speech for clarification questions and custom food creation prompts. Keep screen awake during the session. Handle all three exit modes: Save (persist + go to Dashboard), Cancel (confirmation prompt + rollback), Navigate away (auto-save). See SPEC.md Sections 5.3, 5.4, 6.3, and 7 for the full behavior spec. Types for all WebSocket messages and draft state are in `shared/types.ts`.

**What gets built**:
- `server/src/websocket/voiceSession.ts` — WebSocket handler + session state machine
- `mobile/app/kitchen-mode.tsx` — Full-screen immersive modal
- `mobile/stores/draftStore.ts` — Draft cards, session state, projected macro totals
- `mobile/services/voiceSession.ts` — WebSocket client
- `mobile/services/speech.ts` — On-device STT + Expo Speech TTS wrappers
- `mobile/components/MacroSummaryBar.tsx` — Compact macro bar with live projection
- `mobile/components/DraftMealCard.tsx` — Draft card (normal/clarifying/creating states)
- `mobile/components/ListeningIndicator.tsx` — Mic active visual
- Voice-guided custom food creation flow (full round-trip)
- Save / Cancel / Navigate-away session handling

**Validate**:
- Tap mic on Log tab → Kitchen Mode launches immersive (tabs hidden)
- Speak a food → card appears with nutrition data from USDA
- Speak a correction → card updates
- Say "remove the [item]" → card disappears
- Speak an unknown food → creation flow begins via TTS, card fills in field-by-field
- Say "done" → entries saved, lands on Dashboard with updated macros
- Tap Cancel → confirmation prompt, then rollback
- Screen stays awake throughout
- Macro summary bar updates live as draft items are added

**Commit**: `"add Kitchen Mode with voice logging, WebSocket, and custom food creation"`

---

## Session 9 — Onboarding + Polish (Phase 13)

**Goal**: First-launch experience and final visual/UX refinements.

**Prompt Cursor with**:
> Build Phase 13 from SPEC.md. First, create the onboarding carousel (`mobile/app/onboarding.tsx`) per SPEC.md Section 1.3 — 3 screens: welcome, set goals inline, start logging. Shows once (persist to AsyncStorage). Then do a polish pass across the entire app: add loading indicators for API calls, empty states for Dashboard (today vs past day), error handling per SPEC.md Section 6.5 (backend unreachable, USDA down, Gemini fails, WebSocket disconnect, STT permission denied), and verify visual consistency with the theme (spacing, typography, colors). Verify haptic feedback on all discrete actions per Section 6.1.

**What gets built**:
- `mobile/app/onboarding.tsx` — Onboarding carousel
- Loading states across all screens
- Empty states (Dashboard today, Dashboard past day, search no results, no goals set)
- Error handling (network errors, API failures, STT permission)
- Visual polish and consistency pass

**Validate**:
- Fresh app launch shows onboarding, set goals, land on Dashboard
- Second launch skips onboarding
- Kill the backend → app shows appropriate error states
- Full end-to-end flow: set goals → search and log food manually → use Kitchen Mode to voice-log → check Dashboard → navigate to yesterday → add retroactive entry

**Commit**: `"add onboarding, error handling, and visual polish"`

---

## Standalone: Barcode Scanner (Independent Scope)

**Containment**: This feature is developed **independently** of the main MacroTrack build sessions. It does not modify the core app flow (Log tab, Kitchen Mode, Dashboard, server, or shared types). Work on it in separate conversations or branches. Integration into the main app (e.g. “Scan barcode” on Log, “scan an item” in Kitchen Mode) is deferred until the scanner module is ready.

**Goal**: A self-contained barcode scanning module that outputs a normalized GTIN. It is exercised via a **demo screen** only; the rest of the app does not call it yet.

**Scope**:

- **Camera scanner**: iOS and Android only. Use native `launchScanner()` when available (fastest); fallback to in-app `CameraView` with target overlay. Not required on web.
- **Image upload**: Available on all platforms (iOS, Android, web). User picks an image; app runs barcode detection and returns GTIN if found.
- **Demo access**: A temporary dev-only button (e.g. on Dashboard or Goals) navigates to the barcode demo screen. Remove or replace when integrating later.
- **Output**: Normalized GTIN string (e.g. 13-digit) plus raw value and format, so the main app can later use it for food lookup (USDA/custom/other APIs).

**What gets built** (all under `mobile/`):

- `mobile/features/barcode/` — Types (`BarcodeScanResult`, GTIN), `gtin.ts` (normalize to 13-digit), `scanner.ts` (`scanWithCamera()`, `scanFromImage(uri)`), `BarcodeCameraScreen.tsx` (fallback in-app camera + target), optional `BarcodeResultCard.tsx`
- `mobile/app/barcode-demo.tsx` — Demo route: “Scan with camera” (native only) and “Upload image” (all platforms); display GTIN result
- Dev-only entry point (e.g. button on Dashboard or Goals) → navigate to barcode-demo
- Dependencies: `expo-camera`, `expo-image-picker`; add `expo-camera` plugin to `app.json`

**Platform behavior**:

| Feature           | Web        | iOS / Android |
|------------------|------------|----------------|
| Image upload scan | Yes        | Yes            |
| Camera scanner    | No (hide)  | Yes            |

**Validate**: On device, open demo via dev button → scan with camera and upload image → confirm GTIN is shown. On web, only “Upload image” is available and returns GTIN when a barcode is present in the image.

**When integrating later**: Wire `scanWithCamera()` / `scanFromImage()` into the Log tab and Kitchen Mode (“scan an item”); use returned GTIN for food lookup. No changes to this section required at that time—just use the public scanner API.

### Implementation prompts (by chunk)

Use one prompt per Cursor chat to keep context manageable. Reference this file and `.cursor/rules/barcode-scanner.mdc`; the plan is in `.cursor/plans/standalone_barcode_scanner_e608c709.plan.md` if you need full detail.

---

**Chunk 1 — Types, GTIN normalization, and scanner API**

**Prompt to paste:**

> Build Chunk 1 of the standalone barcode scanner (BUILD_GUIDE.md → Standalone: Barcode Scanner). Add under `mobile/features/barcode/`:
> 1. **types.ts** — Export `BarcodeScanResult { gtin: string; raw: string; format: string }`.
> 2. **gtin.ts** — Implement `normalizeToGTIN(raw: string, format?: string): string`. Strip non-digits; if length is 12, left-pad with one `0` to get 13-digit GTIN; if 13, return as-is. Return empty string or throw for invalid lengths. Support common product formats (e.g. ean13, upc_a).
> 3. **scanner.ts** — Public API: (a) `scanWithCamera(): Promise<BarcodeScanResult | null>` — request camera permission; if `getSupportedFeatures().isModernBarcodeScannerAvailable` use `Camera.launchScanner({ barcodeTypes: ['ean13','upc_a','ean8'] })` and resolve with first scan (normalize via normalizeToGTIN); else resolve with null for now (Chunk 2 will add the fallback screen). On web return null. (b) `scanFromImage(uri: string): Promise<BarcodeScanResult | null>` — call `Camera.scanFromURLAsync(uri, ['ean13','upc_a','ean8'])`, take first result if any, normalize, return; else null. Do not modify barcode-demo.tsx yet.

**What gets built:** `mobile/features/barcode/types.ts`, `gtin.ts`, `scanner.ts`.

**Validate:** From a temporary test (e.g. in barcode-demo or a one-off), call `scanFromImage(uri)` with a local image URI of a barcode and log the result. Optionally unit-test `normalizeToGTIN` with 12- and 13-digit inputs.

---

**Chunk 2 — Fallback camera screen**

**Prompt to paste:**

> Build Chunk 2 of the standalone barcode scanner (BUILD_GUIDE.md → Standalone: Barcode Scanner). Add `mobile/features/barcode/BarcodeCameraScreen.tsx`: full-screen camera scanner for when native launchScanner is not available. Use expo-camera `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ['ean13','upc_a','ean8'] }}` and `onBarcodeScanned`. Show a target overlay (e.g. rounded rectangle in the center) and the text "Point at barcode." Throttle onBarcodeScanned (e.g. 1.5s) so the same barcode does not fire repeatedly. On first successful scan: normalize with normalizeToGTIN, then call `onScan(result: BarcodeScanResult)` and close. Include camera permission state (request if needed) and a Cancel button that calls `onCancel()`. Props: `onScan: (result: BarcodeScanResult) => void`, `onCancel: () => void`. Do not change scanner.ts yet — in Chunk 3 the demo will call scanWithCamera() and, when it needs the fallback (e.g. native scanner unavailable), the demo will render BarcodeCameraScreen and pass onScan/onCancel to complete the same promise.

**What gets built:** `mobile/features/barcode/BarcodeCameraScreen.tsx`; updates to `scanner.ts` to use it when native scanner is unavailable.

**Validate:** On a device where native scanner might be unavailable (or force the fallback path), open the camera screen, point at a barcode, confirm it returns a normalized result and closes; test Cancel.

---

**Chunk 3 — Demo screen wiring**

**Prompt to paste:**

> Build Chunk 3 of the standalone barcode scanner (BUILD_GUIDE.md → Standalone: Barcode Scanner). Update `mobile/app/barcode-demo.tsx`: (1) Two actions: "Scan with camera" (only show when `Platform.OS !== 'web'`) and "Upload image". (2) Scan with camera: if `getSupportedFeatures().isModernBarcodeScannerAvailable`, call `scanWithCamera()` and await; else show `BarcodeCameraScreen` (from features/barcode) and wrap its `onScan`/`onCancel` in a Promise so you get one result flow. Show loading while scanning; on result display gtin, raw, format; on null/cancel show "No barcode" or "Cancelled". (3) Upload image: use expo-image-picker `launchImageLibraryAsync({ mediaTypes: ['images'] })`, then `scanFromImage(uri)`; same result/empty handling. (4) Add `mobile/features/barcode/BarcodeResultCard.tsx` that displays gtin, raw, and format in a card. On web, hide the camera action so only "Upload image" is available.

**What gets built:** Updated `mobile/app/barcode-demo.tsx`; `mobile/features/barcode/BarcodeResultCard.tsx` (optional but useful).

**Validate:** On device: open Barcode demo from Dashboard → Scan with camera → scan a product barcode → see GTIN. Then Upload image → pick image with barcode → see GTIN. On web: only Upload image visible; pick image → see GTIN or "No barcode found".

---

## iOS device build: “latest code not in build”

**Symptom**: `npx expo run:ios --device` (or simulator without Metro) shows an old app; `npx expo start` + open app shows the latest code.

**Likely cause**: The `ios/` folder is **generated** by `expo prebuild` and is not in git. The default Expo/React Native template does two things in Debug: (1) the Xcode “Bundle React Native code and images” phase sets `SKIP_BUNDLING=1`, so no JS bundle is embedded; (2) `AppDelegate` uses the Metro URL for the bundle, so the app expects to load from the dev server. When you run `expo run:ios --device` without Metro, the app falls back to an old or missing embedded bundle, so you see stale (or broken) UI.

**Why it can appear as a “new” regression**: After a fresh `expo prebuild` (e.g. when adding the iOS bundle ID, running prebuild for the first time, or upgrading Expo), the newly generated `ios/` uses these defaults. Older checkouts may have been run with a previously generated `ios/` that behaved differently, or always with Metro running.

**Fix** (re-apply after any `expo prebuild --clean`):

1. **`ios/.xcode.env.updates`** (create if missing):
   ```bash
   # Force embedding the JS bundle in Debug so device builds show latest code.
   # react-native-xcode.sh skips when SKIP_BUNDLING is any non-empty value (even "0"), so we must unset.
   unset SKIP_BUNDLING
   ```

2. **`ios/MacroTrack/AppDelegate.swift`** — In `bundleURL()`, for Debug on a **physical device** use the embedded bundle first so `expo run:ios --device` without Metro works; keep using Metro on the simulator so `expo start` still works:
   ```swift
   override func bundleURL() -> URL? {
   #if DEBUG
     #if targetEnvironment(simulator)
     return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
     #else
     return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
       ?? RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
     #endif
   #else
     return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
   #endif
   }
   ```

Then run a **clean** device build once: `cd mobile && npx expo run:ios --device --no-build-cache`.

---


## Debugging “latest code not in device build” (step-by-step)

If the fix above still doesn’t work, use these steps to see where the pipeline fails.

**1. Confirm `.xcode.env.updates` is used during the build**

- From `mobile/`, run: `rm -f ios/bundle-phase-debug.log` then `npx expo run:ios --device --no-build-cache`.
- After the build finishes, run: `cat mobile/ios/bundle-phase-debug.log`.
- **Expected:** A line with a recent timestamp and `SKIP_BUNDLING=<unset>`.
- **If the file is missing or empty:** The bundle script never sourced `.xcode.env.updates` (path or name might be wrong, or the phase didn’t run).

**2. See whether the bundle phase skips or runs**

- Pick your device UDID (run once): `xcrun devicectl list devices` or look for the device in the Expo device picker. Example: `00008120-001035222205A01E`.
- Build with that device so there’s no interactive prompt, and capture the log:
  ```bash
  cd mobile && npx expo run:ios --device <YOUR_DEVICE_UDID> --no-build-cache 2>&1 | tee ../ios-build.log
  ```
  (Replace `<YOUR_DEVICE_UDID>` with your phone’s UDID.)
- Search the log:
  - `SKIP_BUNDLING enabled; skipping` → The phase is still skipping; `unset SKIP_BUNDLING` isn’t taking effect (e.g. script order, or a different shell).
  - `Bundling for physical device` → The phase is running; the next step is to confirm the bundle file exists.

**3. Confirm `main.jsbundle` is in the built app**

- After a device build, find the built `.app` (e.g. in Xcode’s DerivedData or from the build log).
- Example (replace with your DerivedData path if different):
  ```bash
  APP=$(find ~/Library/Developer/Xcode/DerivedData -name "MacroTrack.app" -path "*Debug-iphoneos*" -type d 2>/dev/null | head -1)
  ls -la "$APP/main.jsbundle" 2>/dev/null && echo "Found" || echo "main.jsbundle NOT in app"
  ```
- **If not found:** The bundle phase may have failed, or the bundle is written somewhere else. Check the full build log for errors from the “Bundle React Native code and images” phase.
- **If found:** Check size and timestamp; they should look recent. Then the problem is likely at runtime (app not loading this bundle; see step 4).

**4. Confirm which bundle URL the app uses at runtime**

- In Xcode, open `ios/MacroTrack.xcworkspace`, set the run destination to your device, and run (Run ▶️).
- In `AppDelegate.swift`, set a breakpoint in `bundleURL()` (and optionally in `sourceURL(for:)`).
- When the breakpoint hits, inspect the return value and whether you’re in the simulator or device branch.
- **Expected on device:** `bundleURL()` returns `Bundle.main.url(forResource: "main", withExtension: "jsbundle")` (non-nil) so the app loads the embedded bundle.
- If it returns the Metro URL or nil, the app won’t use the embedded bundle you built.

**5. Optional: clean everything and rebuild**

- From repo root:
  ```bash
  cd mobile
  rm -rf ios/build ios/bundle-phase-debug.log
  rm -rf ~/Library/Developer/Xcode/DerivedData/MacroTrack-*
  npx expo run:ios --device --no-build-cache
  ```
- Then repeat steps 1–3.

When you’re done debugging, you can remove the `echo ... bundle-phase-debug.log` line from `ios/.xcode.env.updates` and delete `ios/bundle-phase-debug.log`.

---

## Quick Reference

| Session | Phases | Key Files | Est. Complexity |
|---|---|---|---|
| 1 | 1-2 | scaffold, schema.prisma | Low |
| 2 | 3 | usda.ts | Low |
| 3 | 4-5 | gemini.ts, foodParser.ts | Medium |
| 4 | 6 | routes/*.ts | Medium |
| 5 | 7-8 | goals.tsx, *Sheet.tsx, theme.ts | Medium |
| 6 | 9 | index.tsx (Dashboard), date/macro components | Medium |
| 7 | 10 | log.tsx, search, frequent/recent | Medium |
| 8 | 11-12 | voiceSession.ts, kitchen-mode.tsx | High |
| 9 | 13 | onboarding.tsx, polish pass | Low-Medium |
| *Standalone* | — | features/barcode/, barcode-demo.tsx | Medium (independent) |

## Tips

- **Always start a new Cursor chat** for each session. The `.cursor/rules/` files and `SPEC.md` provide persistent context.
- **Reference specific spec sections** in your prompts so Cursor knows exactly what to build.
- **Test backend before frontend** for sessions 2-4. Use curl or a REST client.
- **Commit after each session**. If something breaks, you can roll back cleanly.
- **Session 8 is the hardest**. Split into two conversations (WebSocket first, then Kitchen Mode UI) if the context gets too long.
- **Keep both servers running** in separate terminals: `npx expo start` and `npm run dev` (in server/).
