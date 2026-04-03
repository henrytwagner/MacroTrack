# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active Codebase

**The `mobile/` (React Native/Expo) codebase has been removed.** All development is in `MacroTrackerSwift/` (SwiftUI, iOS 17+, Swift 6). Do not reference or attempt to read `mobile/` files. The original React Native MVP spec is archived at `SPEC_v1_RN.md`.

## Project Overview

MacroTrack is a multi-modal macronutrient tracking iOS app. Users can log food via:
- **Kitchen Mode**: Full-screen immersive session with Gemini Live audio streaming, BLE scale integration, barcode scanning, camera food identification, and inline food search
- **Manual search**: 3-tab food search (search results, my foods, meals) with barcode scanner
- **Quick-add**: Frequent foods and saved meals from the Dashboard

**Project origin**: Started as a University of Michigan EECS 594 course project (Henry Wagner, Ryan Kendra, Lucas Kellar). Now a personal project and business venture.

**Current development focus:**
- Improving voice command reliability and Gemini food recall accuracy (the largest UX friction)
- TestFlight polish — preparing for public beta
- Seed data — populating community food/recipe database to reduce USDA reliance
- Community meals / recipe sharing (see `FEATURES_ROADMAP.md` Feature 3)
- Long-term: evolving toward a camera-assisted, scale-integrated, AR-overlay logging experience (see `BUILD_PLAN.md`)

**Reference documents:**
- `BUILD_PLAN.md` — Long-term vision and phased build strategy for the camera/scale/voice/AR input pipeline
- `FEATURES_ROADMAP.md` — Social, intelligence, and data quality layers (reputation, recipes, day validation, pantry)
- `SPEC_v1_RN.md` — Archived original React Native MVP spec (February 2026)

**Private planning doc** lives at `.claude/projects/.../PLANNING.md` (not in the repo). Read it at the start of sessions to pick up current priorities, in-progress decisions, and next steps. Update it as work progresses — especially when finishing a task, making a design decision, or discovering something the next session needs to know. This is the cross-session scratchpad; keep it concise and current. It also has an "Ideas & Explorations" section for long-term thinking that goes beyond `FEATURES_ROADMAP.md`. When an idea grows enough to need real detail, spin it into its own file under `.claude/projects/.../ideas/<name>.md` and link it from the planning doc.

**Long-term feature directions** (see `FEATURES_ROADMAP.md` for full details):
- **Passive Kitchen Mode**: Evolving Kitchen Mode from voice-first to observation-first — auto-add items by combining scale readings + camera identification, with voice as a correction channel. Does not require the YOLO/AR pipeline.
- **User Reputation**: Single global reputation score per user governing community food trustworthiness. Upvotes, reports, and contribution quality determine score.
- **Recipe Sharing & Meal Prep** (a.k.a. "Community Meals"): Personal meal portioning (`totalServings` on SavedMeal) + a separate community recipe system with discovery, ratings, and forking. Recipes are distinct from community foods.
- **Day Validation & AI Insights**: Users validate days as accurate. Rule-based insights detect metabolic adaptation, over-restriction, and macro imbalances. Long-term, LLM analysis of validated data corpus for deeper pattern recognition and goal adjustment suggestions.
- **Pantry & Macro-Aware Suggestions**: Virtual pantry inventory of foods at home. App recommends snacks and meals that fill remaining macro gaps using available pantry items. Connects to community recipes (filter by pantry availability) and Fridge Scan Mode (auto-populate pantry from camera).

## Commands

### iOS App (MacroTrackerSwift/)
- Open `MacroTrackerSwift/MacroTrackerSwift.xcodeproj` in Xcode
- Build & run on simulator: Cmd+R (requires iOS 17+ simulator)
- Build & run on device: select device target, Cmd+R
- Configuration: `Debug.xcconfig` / `Release.xcconfig` in `MacroTrackerSwift/`
- Swift-specific architecture constraints: read `MacroTrackerSwift/CLAUDE.md`

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

This is a monorepo with four packages:

```
MacroTrackerSwift/    SwiftUI iOS app (iOS 17+, Swift 6)
server/               Fastify backend (REST + WebSocket)
shared/               TypeScript types + Gemini prompt templates
website/              Next.js marketing/waitlist site
```

### Shared Types

`shared/types.ts` is the single source of truth for all domain models. The server imports from it via the `@shared/*` path alias. The Swift app has its own `Models/SharedTypes.swift` that mirrors these types.

### SwiftUI Architecture

**3-tab navigation**: Dashboard, Log, Profile (via `ContentView.swift` + `TabRouter`).

**16 @Observable @MainActor stores** in `MacroTrackerSwift/Stores/`:
- `AuthStore` — Authentication state, login/register/logout, token refresh
- `ProfileStore` — User profile data (health metrics, preferences)
- `GoalStore` — Daily macro targets, goal profiles, guided goal setup
- `DailyLogStore` — Entries for the selected date, frequent/recent foods
- `DateStore` — Selected date (shared across all tabs, defaults to today)
- `DraftStore` — Kitchen Mode draft items, WebSocket session lifecycle
- `SessionStore` — Paused Kitchen Mode sessions (persist/resume)
- `WeightStore` — Weight entries, trends, weekly rate
- `MealsStore` — Saved meals CRUD
- `ProgressPhotoStore` — Progress photo capture, storage, comparison
- `CalendarStore` — Calendar data for date navigation
- `StatsStore` — Weekly stats, top foods, macro distribution
- `InsightsStore` — Rule-based nutrition insights (streaks, trends)
- `AppearanceStore` — Theme (system/light/dark), units (metric/imperial)
- `DashboardLayoutStore` — Dashboard card layout preferences
- `TabRouter` — Tab selection state

**Network layer**:
- `APIClient` (actor) — 50+ REST endpoints, JWT auth headers, auto-refresh
- `WSClient` — WebSocket for Kitchen Mode real-time communication
- `KeychainService` — Secure JWT token storage

**Camera**:
- `KitchenCameraSession` — AVFoundation dual-output (barcode metadata + video frames)
- `ProgressCameraSession` — Front camera for progress photos with ghost overlay

**Scale**:
- `BluetoothScaleService` — CoreBluetooth, Etekcity ESN00 protocol fully decoded
- `ScaleManager` — Singleton with connection state machine and reading stream

**Voice**:
- `AudioCaptureService` — AVAudioEngine VAD with ~300ms pre-roll buffer, 16kHz PCM output
- `AudioPlaybackService` — AVAudioPlayerNode for Gemini spoken responses, echo suppression

**Theme**: `MacroTrackerSwift/MacroTrackerSwift/Theme/` — `Color+Theme.swift` (semantic color tokens, Spacing enum, BorderRadius enum), `Typography.swift` (font extensions). All colors, typography, and spacing must be defined here. No inline magic values in views.

### Server Architecture

**REST API** (`server/src/routes/`): auth, food CRUD, search, goals, profile, barcode, community foods, custom foods, meals, sessions, weight, stats, nutrition label parsing, food preferences, waitlist.

**WebSocket handlers** (`server/src/websocket/`):
- `/ws/kitchen-mode` — **Active handler** (`kitchenModeSession.ts`). Gemini Live function-call-driven. No state machine — session logic is driven by Gemini's function calls. This is the handler for all new Kitchen Mode work.
- `/ws/voice-session` — **Legacy handler** (`voiceSession.ts`). Uses the old state machine (`normal` / `creating:<itemId>`) and `{ action, payload }` intent format. Still registered but superseded.

**Auth middleware** (`server/src/middleware/authenticate.ts`): JWT-based. All API routes require authentication except auth endpoints and health check.

**Services layer** (`server/src/services/`):
- `GeminiLiveService.ts` — Gemini 2.5 Flash Live session manager. Bidirectional audio streaming, 13 function tool declarations, composable system prompt
- `gemini.ts` — Gemini 2.5 Flash text-mode client (used by legacy voice session and non-audio tasks like nutrition label parsing, camera food ID)
- `foodParser.ts` — Lookup orchestrator: custom foods → community foods → USDA → no match. Also handles disambiguation, scale confirm, draft item building
- `foodSearchPipeline.ts` — Unified food search orchestration (manual search flow)
- `usda.ts` — USDA FoodData Central API client
- `barcodeLookup.ts` — Barcode-to-food lookup
- `jwt.ts` — JWT access/refresh token signing and verification
- `appleAuth.ts` — Apple Sign-in identity token verification
- `email.ts` — Password reset emails (Resend)
- `goalService.ts` — Goal profile/timeline computation from health metrics
- `mealCategorizer.ts` — Time-based meal label assignment

### Food Lookup Chain

1. User's custom foods (fuzzy match) — highest trust, user-controlled
2. Community foods (`CommunityFood` model) — reviewed/shared data, preferred over generic database entries
3. USDA FoodData Central — **absolute last resort**. Data quality is unreliable (inconsistent serving sizes, nutrient gaps). The strategic direction is to minimize USDA usage by building up community and custom food databases. Never privilege USDA results over community or custom entries.
4. No match → Custom food creation (user provides nutrition values, voice-guided or manual)

**There is no AI-generated nutrition fallback.** Gemini is a parser only — it never generates, estimates, or fabricates nutrition data. All nutrition comes from user-created custom foods, community foods, or (as a last resort) USDA.

### Kitchen Mode Flow

**Gemini Live audio pipeline**: Client captures audio via `AVAudioEngine` with VAD and ~300ms pre-roll buffer. Raw PCM audio (16kHz int16 mono) streams as `audioChunk` messages over WebSocket. Server forwards audio to Gemini 2.5 Flash via `GeminiLiveService`. Gemini returns two things: (a) function calls (structured actions) and (b) spoken audio responses (played back via `AVAudioPlayerNode`). Echo suppression buffers capture while Gemini is speaking.

**Function-call architecture** (not intent parsing): The `kitchenModeSession.ts` handler is entirely function-call-driven. Gemini directly invokes tools like `lookup_food`, `add_to_draft`, `edit_draft_item`, `remove_draft_item`, `begin_custom_food_creation`, `report_nutrition_field`, `create_custom_food`, `abandon_creation`, `undo`, `redo`, `save_session`, `cancel_session`, `open_barcode_scanner`. No separate intent parsing step.

**Multi-modal input events**: Non-voice inputs (touch edits, scale confirmations, barcode scans, camera captures) are sent as WebSocket messages and forwarded to Gemini as context events via `notifyGemini()`, keeping Gemini's understanding synchronized with all input modalities.

**Draft cards** have three visual states: `normal`, `clarifying` (pulsing highlight + question), `creating` (fields fill progressively during custom food creation).

**Session exit outcomes:**
- **Save / Navigate Away**: persist all draft entries and keep custom foods created in the session
- **Cancel**: discard all draft entries AND delete custom foods created during the session

### Authentication

- **Apple Sign-in**: `POST /api/auth/apple` — identity token verification via `appleAuth.ts`
- **Email/password**: `POST /api/auth/register`, `POST /api/auth/login`
- **Token refresh**: `POST /api/auth/refresh` — rotation via `jwt.ts`
- **Password reset**: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- **Account deletion**: `DELETE /api/auth/account` (required by Apple for Sign in with Apple)
- **iOS client**: Tokens stored in Keychain via `KeychainService`. `AuthStore` manages auth state and auto-refresh.
- **Onboarding**: 9-page flow after first sign-in (welcome, height, weight, DOB, sex, activity level, goal type, aggressiveness, macro review + feature tips).

## Key Constraints

- **Gemini is a parser, not a nutritionist**: Never ask Gemini to generate/estimate nutrition values. The system prompt must include "Never generate, estimate, or approximate nutritional data."
- **USDA is a last resort**: Community and custom food databases are the preferred data sources. USDA FoodData Central is unreliable (inconsistent serving sizes, nutrient gaps). The strategic direction is to minimize USDA usage by building community/custom food coverage. Never default to USDA when community or custom matches exist.
- **FoodEntry sources**: `DATABASE` (USDA), `CUSTOM` (user-created), and `COMMUNITY` (community foods). No AI-estimate source. Personal and community sources are always preferred over USDA.
- **Multi-modal input is a hard constraint**: Every logging action must be reachable via touch alone, without voice, and without camera. No single input modality should be required. Voice, camera, scale, and touch are all first-class — users choose the combination that works for them in any moment.
- **BLE scale** is the accuracy anchor for quantity — prefer scale-provided weight over user-estimated quantities where available.
- **Styling**: All colors, typography, and spacing must be defined in `MacroTrackerSwift/MacroTrackerSwift/Theme/`. No inline magic values in views.

## Gemini Function Tools

The Kitchen Mode handler (`kitchenModeSession.ts`) uses Gemini Live function calling. 13 function declarations in 5 groups:

- **Lookup**: `lookup_food`, `search_usda`
- **Draft**: `add_to_draft`, `edit_draft_item`, `remove_draft_item`
- **Creation**: `begin_custom_food_creation`, `report_nutrition_field`, `create_custom_food`, `abandon_creation`
- **Session**: `undo`, `redo`, `save_session`, `cancel_session`
- **Device**: `open_barcode_scanner`

Context passed with every function response: current draft summary (items, states, pending creation/choice). System prompt sections are composable: ROLE, HARD RULES, SCOPE GUARDRAIL, CONFIRMATION BEHAVIOR, FOOD LOOKUP WORKFLOW, CUSTOM FOOD CREATION FLOW, TOUCH EDITS, SCALE INPUT, BARCODE INPUT, CAMERA INPUT, DRAFT CONTEXT, OTHER COMMANDS.

**Legacy intent format**: The old `voiceSession.ts` handler uses `{ action, payload }` with actions: `ADD_ITEMS`, `EDIT_ITEM`, `REMOVE_ITEM`, `CLARIFY`, `CREATE_FOOD_RESPONSE`, `SESSION_END`, etc. New work should target `kitchenModeSession.ts`.

Meal labels are auto-categorized by `server/src/services/mealCategorizer.ts`. Entries are clustered by time proximity (>1 hour gap = new cluster), then ranked by total calories within broad time gates (morning < 11am, midday 11am-3pm, evening > 3pm). The highest-calorie cluster in each gate gets the primary label (breakfast/lunch/dinner); all others get "snack". Labels are recalculated on every entry create/update/delete. Kitchen Mode session entries are always grouped as one cluster via `voiceSessionId`.

## Barcode Scanner

- VisionKit `DataScannerViewController` with AVFoundation fallback for GTIN types (EAN-8, EAN-13, UPC-E)
- Fully integrated into food search flow and Kitchen Mode (not standalone)
- Duplicate-scan protection (same GTIN within 2s rejected)
- GTIN normalized to 13 digits, pre-fills barcode field during custom food creation
- Server: `POST /api/barcode/lookup` via `barcodeLookup.ts`

## Database

Prisma schema at `server/src/db/prisma/schema.prisma`. Run `npm run db:generate` after any schema change. Key models: `User`, `RefreshToken`, `PasswordReset`, `DailyGoal`, `FoodEntry`, `CustomFood`, `SavedMeal`, `SavedMealItem`, `VoiceSession`, `FoodUnitConversion`, `GoalProfile`, `GoalTimeline`, `CommunityFood`, `CommunityFoodBarcode`, `CommunityFoodReport`, `CommunityFoodAlias`, `USDAFoodMetrics`, `SearchLog`, `WeightEntry`, `UserFoodPreference`, `WaitlistEntry`.

### Schema Change & Migration Rules

**These rules are mandatory whenever modifying `schema.prisma`.**

1. **Never use `db:push` for changes that need to persist.** `db:push` applies schema changes directly to the database without creating a migration file, causing the DB and migration history to diverge. Only use `db:push` for throwaway local prototyping where you intend to reset the database afterward.

2. **Always create a migration after editing the schema.** The workflow is:
   ```bash
   # 1. Edit schema.prisma
   # 2. Create a named migration (from server/):
   npm run db:migrate -- --name descriptive_snake_case_name
   # 3. Regenerate the Prisma client:
   npm run db:generate
   # 4. Verify the migration SQL looks correct:
   cat src/db/prisma/migrations/<timestamp>_<name>/migration.sql
   ```

3. **Never hand-write SQL in the migrations directory.** All migration SQL must be generated by `prisma migrate dev`. If you need custom SQL (e.g., data backfill, pg extensions), use `prisma migrate dev --create-only` to create an empty migration, then add your SQL to the generated `migration.sql` file — never as a standalone `.sql` file.

4. **Never use `IF NOT EXISTS` / `IF EXISTS` in migrations.** If a migration needs these guards, the DB and migration history are already out of sync. Fix the root cause (baseline or reset) instead of adding idempotent hacks.

5. **One schema change = one migration.** Don't batch unrelated changes into a single migration. Each migration should be a logical unit (e.g., "add weight tracking" or "add community food aliases").

6. **If a migration fails mid-apply:** Do NOT manually fix the database and re-run. Instead:
   - Check what was partially applied with `prisma migrate status --schema=src/db/prisma/schema.prisma`
   - If the failed migration left the DB in a broken state, mark it as rolled back: `prisma migrate resolve --rolled-back <migration_name> --schema=src/db/prisma/schema.prisma`
   - Fix the schema, create a new migration, and apply it

7. **After modifying schema.prisma, always commit the schema change AND the migration together** in the same commit. A schema change without its migration (or vice versa) is drift waiting to happen. A pre-commit hook enforces this — it will reject commits that have one without the other.

8. **Never run `db push` against a remote/deployed database.** This applies to Railway dev, Railway prod, or any non-localhost database. `db push` creates schema drift that makes future migrations fail with "already exists" or "does not exist" errors. If you need to prototype, use `db push` against localhost only, then `prisma migrate reset` to clean up before creating the real migration.

9. **Never use `prisma migrate resolve --applied` to skip a migration.** This marks a migration as applied without running its SQL, causing the DB and migration history to silently diverge. Every downstream migration that references objects from the skipped migration will fail. If a migration can't apply, diagnose why — don't paper over it. The only safe resolve command is `--rolled-back` to mark a genuinely failed migration for retry.

10. **Always commit server source changes alongside schema migrations.** If a migration adds/removes an enum value, renames a column, or changes a type, the TypeScript code that references those Prisma types must be updated and committed in the same push. Otherwise the Docker build will fail on type mismatches between `shared/types.ts` and the Prisma-generated client.
