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

## Tips

- **Always start a new Cursor chat** for each session. The `.cursor/rules/` files and `SPEC.md` provide persistent context.
- **Reference specific spec sections** in your prompts so Cursor knows exactly what to build.
- **Test backend before frontend** for sessions 2-4. Use curl or a REST client.
- **Commit after each session**. If something breaks, you can roll back cleanly.
- **Session 8 is the hardest**. Split into two conversations (WebSocket first, then Kitchen Mode UI) if the context gets too long.
- **Keep both servers running** in separate terminals: `npx expo start` and `npm run dev` (in server/).
