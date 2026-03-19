# MacroTrackerSwift — Architecture Constraints

This document is the source of truth for AI-assisted development of the Swift app.
Always read this before generating or modifying Swift files.

## Platform & Language

- **Minimum deployment: iOS 17.0** (project currently set to 26.x SDK)
- **Swift 6** with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
  - All non-actor types default to `@MainActor` — write `@MainActor` explicitly for clarity
  - `actor` types have their own isolation (not MainActor)
- **`async/await` only** — no Combine, no callbacks, no DispatchQueue
- **`@Observable` only** — never use `ObservableObject` / `@Published` / `@StateObject` / `@ObservedObject`
- No third-party Swift packages without a clear native API gap justification

## Architecture Rules

### Views
- Views are purely declarative — no business logic, no API calls, no direct store mutations inside `body`
- Views read from stores via `@Environment` injection
- All side effects go in `.task {}` or explicit action methods

### Stores (Observation layer)
- One `@Observable @MainActor final class` per RN store
- Singletons via `static let shared`
- Each store owns its fetch/mutate methods; views call them, not `APIClient` directly
- Store responsibilities match RN Zustand stores 1:1 through Phase G cutover:
  - `DateStore` ↔ `dateStore.ts`
  - `DailyLogStore` ↔ `dailyLogStore.ts`
  - `GoalStore` ↔ `goalStore.ts`
  - `DraftStore` ↔ `draftStore.ts`

### Networking
- `actor APIClient` — never call it from a `View` body; always from a store method or `.task {}`
- `WSClient` — skeleton in Phase A; full integration with `DraftStore` in Phase E
- Base URL reads from `Config.baseURL` (xcconfig-driven; falls back to `#if DEBUG` constant)

### Models
- All types in `Models/SharedTypes.swift` — exact port of `shared/types.ts`
- `FoodSource.AI_ESTIMATE` is **intentionally absent** — server must never send it
- All model structs conform to `Codable` and `Sendable`

## Theme

- All colors from `Color+Theme.swift` (semantic tokens only — no hex literals in views)
- All spacing from `Spacing` enum; all corner radii from `BorderRadius` enum
- All typography from `Font` extensions in `Typography.swift`
- No magic numbers in views

## Before Porting a Screen

1. Read the corresponding RN source file first (e.g., `mobile/app/(tabs)/log.tsx`)
2. Read `SPEC.md` for requirements
3. Check `BUILD_PLAN.md` for phase scope
4. Check the parent `CLAUDE.md` for cross-cutting constraints

## Phase Status

- **Phase A**: Foundation (Config, Types, Theme, Stores, APIClient, WSClient skeleton) ✓
- **Phase B**: Shell + Simple Screens (Dashboard + Profile) ✓
- **Phase C**: Manual search + food detail
- **Phase D**: Settings, profile, goals
- **Phase E**: Kitchen Mode (WSClient + DraftStore integration)
- **Phase F**: Barcode scanner
- **Phase G**: Feature parity cutover; retire RN app
