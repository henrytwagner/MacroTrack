# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active Codebase

**The `mobile/` (React Native/Expo) directory is deprecated.** All active development is in `MacroTrackerSwift/` (SwiftUI). Do not reference, suggest changes to, or read files from `mobile/` by default. Only touch `mobile/` if explicitly asked.

## Project Overview

MacroTrack is a voice-first macronutrient tracking app. Users can log food via voice in "Kitchen Mode" (immersive full-screen modal with live draft cards and WebSocket streaming), manual search, or barcode scanning.

**Current development focus:**
- Improving the voice logging flow and Kitchen Mode UI (responsiveness, polish, UX refinements)
- Improving manual entry pages
- Integrating BLE scale input as a quantity source alongside voice
- Long-term: evolving toward a camera-assisted, scale-integrated, AR-overlay logging experience (see `BUILD_PLAN.md`)

Full product specification lives in `SPEC.md`. Consult it for detailed requirements. Long-term vision and phased build strategy for the input pipeline (scale, camera, voice, AR) lives in `BUILD_PLAN.md`. Long-term feature directions for social, data quality, and intelligence layers live in `FEATURES_ROADMAP.md`.

**Private planning doc** lives at `.claude/projects/.../PLANNING.md` (not in the repo). Read it at the start of sessions to pick up current priorities, in-progress decisions, and next steps. Update it as work progresses — especially when finishing a task, making a design decision, or discovering something the next session needs to know. This is the cross-session scratchpad; keep it concise and current. It also has an "Ideas & Explorations" section for long-term thinking that goes beyond `FEATURES_ROADMAP.md`. When an idea grows enough to need real detail, spin it into its own file under `.claude/projects/.../ideas/<name>.md` and link it from the planning doc.

**Long-term feature directions** (see `FEATURES_ROADMAP.md` for full details):
- **Passive Kitchen Mode**: Evolving Kitchen Mode from voice-first to observation-first — auto-add items by combining scale readings + camera identification, with voice as a correction channel. Does not require the YOLO/AR pipeline.
- **User Reputation**: Single global reputation score per user governing community food trustworthiness. Upvotes, reports, and contribution quality determine score.
- **Recipe Sharing & Meal Prep**: Personal meal portioning (`totalServings` on SavedMeal) + a separate community recipe system with discovery, ratings, and forking. Recipes are distinct from community foods.
- **Day Validation & AI Insights**: Users validate days as accurate. Rule-based insights detect metabolic adaptation, over-restriction, and macro imbalances. Long-term, LLM analysis of validated data corpus for deeper pattern recognition and goal adjustment suggestions.
- **Pantry & Macro-Aware Suggestions**: Virtual pantry inventory of foods at home. App recommends snacks and meals that fill remaining macro gaps using available pantry items. Connects to community recipes (filter by pantry availability) and Fridge Scan Mode (auto-populate pantry from camera).

## Commands

### Mobile (from `mobile/`)
```bash
npm run start:dev        # Start Metro (always use this — clears cache)
npx expo run:ios         # Run on iOS simulator (separate terminal from Metro)
npm run ios:device       # Run on physical device
npm run lint             # ESLint
npm run test             # Jest (all tests)
npm test -- --testPathPattern=barcode  # Run a single test file by pattern
```

> **iOS workflow**: Two terminals required. Terminal 1: `npm run start:dev` (must run on port 8081). Terminal 2: `npx expo run:ios`.

### Server (from `server/`)
```bash
npm run dev              # Watch mode (tsx)
npm run build            # TypeScript compilation
npm run db:generate      # Regenerate Prisma client after schema changes
npm run db:migrate       # Create and apply a new migration
npm run db:push          # Sync schema to DB without migration (dev only)
npm run test             # Jest
```

## Architecture

This is a monorepo with three packages:

```
mobile/     Expo React Native app
server/     Fastify backend (REST + WebSocket)
shared/     TypeScript types shared across mobile and server
```

### Shared Types

`shared/types.ts` is the single source of truth for all domain models. Both `mobile/` and `server/` import from it via the `@shared/*` path alias.

### Mobile State Management

Four Zustand stores in `mobile/stores/`:
- `dateStore` — Selected date (shared across all tabs). Defaults to today. All entry CRUD uses this date.
- `draftStore` — Kitchen Mode draft items and WebSocket session state
- `dailyLogStore` — Entries for the selected date; also tracks frequent/recent foods
- `goalStore` — Daily macro targets

### Server Architecture

**REST API** (`server/src/routes/`) handles food CRUD, search, goals, profile, barcode, and community foods.

**WebSocket** at `/ws/voice-session` handles Kitchen Mode voice sessions. The handler in `server/src/websocket/voiceSession.ts` maintains a state machine: `normal` or `creating:<itemId>` (mid-custom-food-creation).

**Services layer** (`server/src/services/`):
- `foodParser.ts` — Lookup orchestrator: custom foods → USDA FoodData Central → no match (triggers voice-guided creation flow)
- `gemini.ts` — Gemini 2.0 Flash client; parses transcripts into structured intents only
- `usda.ts` — USDA FoodData Central API client

### Food Lookup Chain

1. User's custom foods (fuzzy match) — highest trust, user-controlled
2. Community foods (`CommunityFood` model) — reviewed/shared data, preferred over generic database entries
3. USDA FoodData Central — lower priority; data quality is inconsistent. Use as a fallback, not a default authority.
4. No match → Voice-guided custom food creation (user provides nutrition values)

**There is no AI-generated nutrition fallback.** Gemini is a parser only — it never generates, estimates, or fabricates nutrition data. All nutrition comes from user-created custom foods, community foods, or USDA.

**On data source trust:** Personal and community-logged data is treated as more reliable than USDA entries, which have inconsistent serving sizes and nutrient completeness. Do not privilege USDA results over community or custom entries when both are available. The direction of travel is toward personal and community data as primary sources.

### Kitchen Mode Flow

On-device STT (expo-speech-recognition) sends transcript segments via WebSocket → Gemini parses intent → foodParser looks up food → server streams back `WSItemsAddedMessage`, `WSClarifyMessage`, `WSCreateFoodPromptMessage`, etc. → mobile updates draft cards.

Draft cards have three visual states: `normal`, `clarifying` (pulsing highlight + question), `creating` (fields fill progressively as user speaks nutrition info).

Session exit outcomes:
- **Save / Navigate Away**: persist all draft entries and keep custom foods created in the session
- **Cancel**: discard all draft entries AND delete custom foods created during the session

## Key Constraints

- **No auth**: Single-user prototype. Default user is hardcoded in `server/src/db/defaultUser.ts`.
- **Gemini is a parser, not a nutritionist**: Never ask Gemini to generate/estimate nutrition values. The system prompt must include "Never generate, estimate, or approximate nutritional data."
- **FoodEntry sources**: `DATABASE` (USDA), `CUSTOM` (user-created), and `COMMUNITY` (community foods). No AI-estimate source. Personal and community sources are preferred over USDA when both match.
- **Styling**: All colors, typography, and spacing must be defined in `mobile/constants/theme.ts`. No inline magic values.
- **Barcode scanner** (`mobile/features/barcode/`) is a standalone module. Do not integrate into core app flows (Log tab, Kitchen Mode, server, `shared/types`) until the dedicated integration phase described in BUILD_GUIDE.md.
- **Multi-modal input is a hard constraint**: Every logging action must be reachable via touch alone, without voice, and without camera. No single input modality should be required. Voice, camera, scale, and touch are all first-class — users choose the combination that works for them in any moment.
- **BLE scale** (`mobile/features/scale/`) is being integrated as a quantity input source. The scale is the accuracy anchor for quantity — prefer scale-provided weight over user-estimated quantities where available.

## Gemini Intent Format

Every Gemini response must be `{ action, payload }`. Valid actions: `ADD_ITEMS`, `EDIT_ITEM`, `REMOVE_ITEM`, `CLARIFY`, `CREATE_FOOD_RESPONSE`, `SESSION_END`. Context passed with every request: current transcript, draft items array, time of day (for meal label assignment), and current session state.

Meal labels are auto-categorized by `server/src/services/mealCategorizer.ts`. Entries are clustered by time proximity (>1 hour gap = new cluster), then ranked by total calories within broad time gates (morning < 11am, midday 11am–3pm, evening > 3pm). The highest-calorie cluster in each gate gets the primary label (breakfast/lunch/dinner); all others get "snack". Labels are recalculated on every entry create/update/delete. Kitchen Mode session entries are always grouped as one cluster via `voiceSessionId`.

## Barcode Scanner

- Public API: `scanWithCamera()` (iOS/Android only), `scanFromImage(uri, options?)` (all platforms)
- Result: `BarcodeScanResult { gtin: string; raw: string; format: string }` — GTIN normalized to 13 digits
- Platform strategies: native `launchScanner()` → fallback `CameraView`; web uses client-side @zxing/library; iOS image upload goes to `POST /api/barcode/scan`
- Tests live in `mobile/features/barcode/__tests__/`; update them when changing barcode logic

## Database

Prisma schema at `server/src/db/prisma/schema.prisma`. Run `npm run db:generate` after any schema change. Key models: `User`, `DailyGoal`, `FoodEntry`, `CustomFood`, `VoiceSession`, `FoodUnitConversion`, `GoalProfile`, `GoalTimeline`, `CommunityFood`.
