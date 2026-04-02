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
