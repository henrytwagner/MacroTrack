# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MacroTrack is a voice-first macronutrient tracking app. Users can log food via voice in "Kitchen Mode" (immersive full-screen modal with live draft cards and WebSocket streaming), manual search, or barcode scanning.

Full product specification lives in `SPEC.md`. Consult it for detailed requirements.

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

1. User's custom foods (fuzzy match)
2. USDA FoodData Central
3. No match → Voice-guided custom food creation (user provides nutrition values)

**There is no AI-generated nutrition fallback.** Gemini is a parser only — it never generates, estimates, or fabricates nutrition data. All nutrition comes from USDA or user-created custom foods.

### Kitchen Mode Flow

On-device STT (expo-speech-recognition) sends transcript segments via WebSocket → Gemini parses intent → foodParser looks up food → server streams back `WSItemsAddedMessage`, `WSClarifyMessage`, `WSCreateFoodPromptMessage`, etc. → mobile updates draft cards.

Draft cards have three visual states: `normal`, `clarifying` (pulsing highlight + question), `creating` (fields fill progressively as user speaks nutrition info).

Session exit outcomes:
- **Save / Navigate Away**: persist all draft entries and keep custom foods created in the session
- **Cancel**: discard all draft entries AND delete custom foods created during the session

## Key Constraints

- **No auth**: Single-user prototype. Default user is hardcoded in `server/src/db/defaultUser.ts`.
- **Gemini is a parser, not a nutritionist**: Never ask Gemini to generate/estimate nutrition values. The system prompt must include "Never generate, estimate, or approximate nutritional data."
- **FoodEntry sources**: Only `DATABASE` (USDA) or `CUSTOM` (user-created). No AI-estimate source.
- **Styling**: All colors, typography, and spacing must be defined in `mobile/constants/theme.ts`. No inline magic values.
- **Barcode scanner** (`mobile/features/barcode/`) is a standalone module. Do not integrate into core app flows (Log tab, Kitchen Mode, server, `shared/types`) until the dedicated integration phase described in BUILD_GUIDE.md.

## Gemini Intent Format

Every Gemini response must be `{ action, payload }`. Valid actions: `ADD_ITEMS`, `EDIT_ITEM`, `REMOVE_ITEM`, `CLARIFY`, `CREATE_FOOD_RESPONSE`, `SESSION_END`. Context passed with every request: current transcript, draft items array, time of day (for meal label assignment), and current session state.

Meal label assignment by time: Breakfast 5–10:59 AM, Lunch 11 AM–1:59 PM, Snack 2–4:59 PM, Dinner 5–9:59 PM, Snack 10 PM–4:59 AM. Food context can override (e.g. "breakfast burrito" at 1 PM → Breakfast).

## Barcode Scanner

- Public API: `scanWithCamera()` (iOS/Android only), `scanFromImage(uri, options?)` (all platforms)
- Result: `BarcodeScanResult { gtin: string; raw: string; format: string }` — GTIN normalized to 13 digits
- Platform strategies: native `launchScanner()` → fallback `CameraView`; web uses client-side @zxing/library; iOS image upload goes to `POST /api/barcode/scan`
- Tests live in `mobile/features/barcode/__tests__/`; update them when changing barcode logic

## Database

Prisma schema at `server/src/db/prisma/schema.prisma`. Run `npm run db:generate` after any schema change. Key models: `User`, `DailyGoal`, `FoodEntry`, `CustomFood`, `VoiceSession`, `FoodUnitConversion`, `GoalProfile`, `GoalTimeline`, `CommunityFood`.
