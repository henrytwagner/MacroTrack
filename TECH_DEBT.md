# Tech Debt Register

Items identified through architecture review. Organized by impact tier. iOS migration is tracked separately.

---

## Tier 1 — Will cause real pain as the project grows

### 1. `foodParser.ts` is a God class

**File**: `server/src/services/foodParser.ts` (~759 lines)

Five distinct responsibilities in one file: lookup orchestration, per-tier food matching, macro scaling arithmetic, intent handling, and disambiguation logic. When the barcode and scale inputs need the same lookup chain as voice, this will need to be split under pressure.

**Proposed split**:
- `foodLookup.ts` — multi-tier resolver (history → custom → community → USDA)
- `macroScaling.ts` — `scaleMacros` and serving size math
- `intentHandlers.ts` — `handleAddItems`, `handleEditItem`, `handleRemoveItem`, etc.

---

### 2. Module-level `tmpIdCounter` is a latent concurrency bug

**File**: `server/src/services/foodParser.ts:28–37`

A module-level mutable integer reset by an exported `resetTmpIdCounter()` function. Two concurrent sessions share the same counter and would produce colliding draft item IDs. Currently safe because the app is single-user and sessions are effectively serialized, but will break silently when auth and multi-user are added.

**Fix**: Replace with per-session UUID generation (e.g., `crypto.randomUUID()` with a short prefix). Remove `resetTmpIdCounter` entirely.

---

### 3. `findCustomFood` loads all custom foods into JS memory

**File**: `server/src/services/foodParser.ts:71`

```ts
const customFoods = await prisma.customFood.findMany({ where: { userId } });
// ... JS-level filtering below
```

Fetches every custom food for the user and filters in application code. Works at single-user prototype scale, breaks at any real data volume.

**Fix**: Add the `pg_trgm` PostgreSQL extension and a GIN index on `CustomFood.name`. Replace JS filtering with a database-level fuzzy query.

Same pattern applies to `lookupUserHistory` (`foodParser.ts:148`), which fetches 50 entries and groups them in JS — that grouping is a single `GROUP BY` + `COUNT` SQL query.

---

### 4. No caching on USDA lookups

Every voice parse, barcode scan, and history reconstruction that touches a USDA food hits the external USDA API. When the scale + camera flow needs real-time macro computation (live weight × food macros), an uncached network round-trip will break the experience.

**Fix**: An in-process LRU cache on `getFoodByFdcId` covers the most frequent case (a food you've logged before). A 500-entry Map with a TTL is sufficient — no Redis needed for a single-user prototype. The USDA `searchFoods` path benefits too but is less critical.

---

## Tier 2 — Code quality and future-proofing

### 5. `AI_ESTIMATE` in `FoodSource` is a footgun

**File**: `shared/types.ts:8`

```ts
export type FoodSource = "DATABASE" | "CUSTOM" | "COMMUNITY" | "AI_ESTIMATE";
```

`AI_ESTIMATE` is a valid type but CLAUDE.md explicitly forbids it. As the codebase grows, any developer seeing a valid enum value will use it. The type and the constraint are out of sync.

**Fix**: Either remove `AI_ESTIMATE` from the union, or replace it with a branded stub type that carries a comment explaining why it must never appear in a `FoodEntry`. If AI estimation is ever formally re-evaluated (it shouldn't be per current design), that's the place to make the decision explicit.

---

### 6. No runtime validation at the WebSocket boundary

The server receives `WSClientMessage` frames with no runtime schema validation — type safety is TypeScript-only. The protocol now has 25+ message types in `WSServerMessage`. A malformed or unexpected client message can propagate silently into the session state machine.

**Fix**: Add Zod schemas for all `WSClientMessage` variants. Parse at the top of the WS receive handler and return a typed `error` frame on failure. Low effort, high confidence gain.

---

### 7. Session state machine is embedded in WebSocket transport

**File**: `server/src/websocket/voiceSession.ts`

WebSocket I/O (receiving frames, calling `send()`) is mixed with business logic (creation flow state machine, undo/redo stack, history query handling, disambiguation flow). The state machine is untestable without a live WebSocket connection.

**Fix**: Extract a `VoiceSessionStateMachine` class that accepts typed events and emits typed `WSServerMessage[]` arrays. The WebSocket handler becomes a thin adapter. Given the session flow complexity (10+ session states, 25+ WS message types), having the state machine unit-testable in isolation is increasingly valuable.

---

### 8. `processTranscript` silently drops most intent types

**File**: `server/src/services/foodParser.ts:720`

The switch statement handles `ADD_ITEMS`, `EDIT_ITEM`, `REMOVE_ITEM`, `CLARIFY`, `CREATE_FOOD_RESPONSE`, and `SESSION_END`. All other intents (`QUERY_HISTORY`, `SUGGEST_FOODS`, `DISAMBIGUATE_CHOICE`, `ESTIMATE_FOOD`, etc.) fall to the default error case. These are presumably handled upstream in `voiceSession.ts` before `processTranscript` is called — but this routing contract is implicit and invisible.

**Fix**: Make the routing explicit. Either all intents flow through a single dispatch point in the session handler, or `processTranscript` returns a discriminated union that includes a `{ handled: false, intent }` variant that the caller is required to handle.

---

## Architecture direction

### Extract a `FoodResolverService` before building Phase 1 features

The multi-tier lookup chain (history → custom → community → USDA) is currently embedded inside foodParser functions that assume a voice session context. The barcode flow and scale + camera flow need the same chain but without session context.

A `FoodResolverService` that accepts a food identifier (name string, GTIN, fdcId, or vision model output label) and returns a resolved `DraftItem` would be shared across all three input modalities. This is the highest-leverage extraction to do before Phase 1 work begins.

### On microservices

Not the right move at this stage. A well-structured modular monolith is the correct intermediate step. The one place where a service boundary makes sense *later* is the Gemini parsing step — LLM calls have different latency and failure characteristics than local food lookup. Putting LLM calls behind an in-process queue would decouple voice parsing from food resolution if needed.

When auth is added, no internal changes are required — `userId` is already threaded through every service function. The change is at the route boundary only (replace `getDefaultUserId()` with a token lookup).

---

### Minor: `GeminiRequestContext` sends the full draft on every request

**File**: `shared/types.ts:793`

The full `currentDraft` array is included in every Gemini request. As sessions grow longer, this increases token cost and latency on each transcript segment. A rolling window or a summarized draft context would keep token usage flat regardless of session length.

---

*Last updated: March 2026*
