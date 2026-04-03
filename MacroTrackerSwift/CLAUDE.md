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
- One `@Observable @MainActor final class` per domain concern
- Singletons via `static let shared`
- Each store owns its fetch/mutate methods; views call them, not `APIClient` directly
- 16 stores: `AuthStore`, `ProfileStore`, `GoalStore`, `DailyLogStore`, `DateStore`, `DraftStore`, `SessionStore`, `WeightStore`, `MealsStore`, `ProgressPhotoStore`, `CalendarStore`, `StatsStore`, `InsightsStore`, `AppearanceStore`, `DashboardLayoutStore`, `TabRouter`

### Networking
- `actor APIClient` — never call it from a `View` body; always from a store method or `.task {}`
- `WSClient` — WebSocket client for Kitchen Mode real-time communication with `DraftStore`
- `KeychainService` — secure JWT token storage (access + refresh tokens)
- Base URL reads from `Config.baseURL` (xcconfig-driven; falls back to `#if DEBUG` constant)

### Models
- All types in `Models/SharedTypes.swift` — exact port of `shared/types.ts`
- `FoodSource.AI_ESTIMATE` has been removed from both server and client (was never used correctly)
- All model structs conform to `Codable` and `Sendable`

## Theme

- All colors from `Color+Theme.swift` (semantic tokens only — no hex literals in views)
- All spacing from `Spacing` enum; all corner radii from `BorderRadius` enum
- All typography from `Font` extensions in `Typography.swift`
- No magic numbers in views

## Before Modifying a Screen

1. Read `BUILD_PLAN.md` for current feature scope and phasing
2. Check the parent `CLAUDE.md` for cross-cutting constraints
3. Check existing store methods before adding new API calls — the store may already have what you need

## Migration Status

**Complete.** All migration phases (A-G) are done. The SwiftUI app is the sole active client. The React Native `mobile/` directory has been removed. No further porting work is needed.
