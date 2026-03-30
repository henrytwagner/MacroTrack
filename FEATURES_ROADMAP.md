# MacroTrack: Features Roadmap
### Social, Intelligence, and Data Quality Layers

*Status: Planning. This document captures long-term feature directions that sit on top of the multi-modal input pipeline described in `BUILD_PLAN.md`. These features are not yet in development — they represent the next horizon of work after the core camera/scale/voice pipeline matures.*

---

## Relationship to Other Documents

- **`BUILD_PLAN.md`** covers the *input pipeline*: BLE scale, visual food identification, AR overlays, voice confirmation. It answers: *how does food get into the app?*
- **`SPEC.md`** covers the *MVP product*: daily tracking, Kitchen Mode, manual logging, goals. It answers: *what does the app do today?*
- **This document** covers the *social, intelligence, and data quality layers*: community trust, recipe sharing, pantry-based suggestions, validated data, and AI-driven insights. It answers: *what happens to the data after it's logged, and how does the community ecosystem and personal intelligence around it work?*

---

## 1. Passive Intent-Guessing Kitchen Mode

### 1.1 Vision

The user props their phone on the kitchen counter with the BLE scale connected. They cook normally. As they place each food item on the scale:

1. The scale detects new weight (streaming readings, not just final confirmation)
2. The camera auto-captures a frame when the scale reading stabilizes
3. Gemini Live identifies the food from the photo
4. The identified food + scale weight are combined — macros computed
5. A draft item is **auto-added** with an undo window
6. The user says "remove that" or taps undo if wrong; otherwise does nothing

Total user effort per item: place food on scale. That's it.

This is the evolution of Kitchen Mode from a *voice-first* interface to an *observation-first* interface. Voice becomes a correction channel ("that's not quinoa, it's rice") rather than the primary input.

### 1.2 Key Insight: Does Not Require the AR Pipeline

The passive mode works entirely with the current Gemini Live photo identification infrastructure. When the scale stabilizes, the app captures a photo and sends it to Gemini via `sendImageWithPrompt()` — the same path used today for manual camera capture in Kitchen Mode. Gemini identifies the food, calls `lookup_food`, then `add_to_draft`. Latency of ~500–1000ms is invisible because the user is not actively waiting — they're cooking.

The YOLO/CoreML pipeline from `BUILD_PLAN.md` Phase 2–3 is relevant for *real-time AR overlays* (bounding boxes, live macro tags) but is **not a prerequisite** for passive mode. Passive mode can ship on the existing Gemini Live stack.

### 1.3 Core Technical Components

**A. Scale Weight State Machine**

Currently, the scale integration sends a `scale_confirm` WebSocket message only when the user explicitly confirms a weight on a specific draft item. For passive mode, the scale needs to emit *state transition events* inferred from the raw reading stream:

```
idle → loading → stabilized → [auto-capture triggered] → unloading → idle
```

States:
- **idle**: Scale at zero (±threshold). Ready for next item.
- **loading**: Weight increasing. Something is being placed on the scale.
- **stabilized**: Weight stable for >1 second. Item is fully on the scale.
- **unloading**: Weight decreasing back toward zero. Item removed.

The state machine consumes the existing `AsyncStream<ScaleReading>` from `ScaleProtocol.readings()` and emits higher-level transitions. Debounce logic prevents false triggers from scale oscillation near zero.

**B. Event-Triggered Camera Capture**

When the scale transitions to `stabilized`, the app automatically captures a frame from the active camera session. `KitchenCameraSession` already has `AVCaptureVideoDataOutput` with per-frame pixel buffer access — a `captureFrameForIdentification()` method grabs the current frame without requiring the user-initiated photo flow.

**C. Intent Inference Engine**

A decision layer that combines sensor events into actions:

| Sensor Pattern | Inferred Intent | Action |
|---|---|---|
| Scale stabilized + camera identifies food | User placed food to weigh it | Auto-add to draft |
| Scale stabilized + barcode scanned | User scanned packaged food on scale | Auto-add to draft |
| Scale returns to zero after auto-add | User removed food, ready for next | Confirm previous item, reset |
| Voice: "remove that" / "that's wrong" | Correction | Remove last auto-added item |
| Voice: "that's rice not quinoa" | Misidentification correction | Replace last item |
| Silence >30s after items added | Session winding down | "Ready to save?" prompt |

**D. Undo Window**

Every auto-added item has a configurable undo window (~5 seconds). During this window:
- A snackbar shows: "Added chicken breast 187g — Undo"
- Voice rejection ("remove that") or tap cancels the add
- If the window expires with no rejection, the item is confirmed

### 1.4 Open Questions

- **Multi-item on scale**: What if the user places two items simultaneously? The camera may identify multiple foods, but the scale gives one combined weight. Options: ask the user to separate, or use estimated proportions from camera.
- **Re-weighing same item**: User picks up food to look at it, puts it back. The state machine sees idle → stabilized again. Need dedup logic based on similar weight + same visual identification within a time window.
- **Camera field of view**: The phone may not be aimed at the scale. Need to handle "scale stabilized but camera can't see the food" gracefully — fall back to asking the user.
- **Background noise**: Kitchen environments are noisy. The undo voice command ("remove that") needs high-confidence STT to avoid false positives. Consider requiring a wake word or louder-than-ambient threshold.

### 1.5 Groundwork That Can Be Laid Now

1. **Scale streaming message type**: Define `WSScaleStreamMessage` in `shared/types.ts` — continuous readings alongside existing `scale_confirm`.
2. **Passive mode session flag**: `passiveMode` boolean on `VoiceSession` (Prisma) and `KitchenSession` (server).
3. **Scale weight state machine**: `ScaleWeightState` enum + `ScaleWeightStateMachine` class in Swift `Scale/` directory. Testable independently.
4. **Auto-capture method**: `captureFrameForIdentification() async -> UIImage?` on `KitchenCameraSession`.
5. **Sensor event tracking model**: `SensorEvent` in Prisma for data collection (event type, payload, timestamp, session ID).

### 1.6 Phasing

| Phase | Scope | Dependencies |
|---|---|---|
| A | Groundwork: state machine, message types, passive flag, auto-capture method | Stable BLE scale connection |
| B | Auto-identification: scale stabilize → auto-capture → Gemini ID → show result with confirmation button (not auto-add yet) | Phase A |
| C | Full passive: auto-add with undo. Silence = confirm. Voice rejection. | Phase B |
| D | Refinement: confidence thresholds, correction history, multi-item handling | Phase C |

---

## 2. User Reputation & Community Data Quality

### 2.1 Vision

Every user has a single global reputation score (0–100). This score silently governs the community food ecosystem:

- Foods created by high-reputation users start with a higher `trustScore` (0.7 instead of 0.5)
- High-reputation users' upvotes carry more weight in boosting a food's trust
- Search ranking considers creator reputation alongside the food's own metrics
- Users who consistently file valid reports build reputation; spam reporters lose it

The reputation system is a quality flywheel: good data attracts trust, trust raises visibility, visibility attracts more verification, verification confirms quality.

### 2.2 Current State

The community food system already has per-food quality signals:
- `trustScore` (Float, 0–1, default 0.5) — decremented by 0.08 per report
- `usesCount` — incremented when food is logged
- `reportsCount` — tracks complaints
- `CommunityFoodReport` — audit trail with reason + details
- Status transitions: ACTIVE → PENDING at 5 reports

What's missing: per-*user* reputation, upvoting/confirmation, and reputation-aware trust scoring.

### 2.3 Reputation Score Design

**Single global score, 0–100.** Displayed as tiers:

| Score Range | Tier | Significance |
|---|---|---|
| 0–19 | New Member | Default state, no special privileges |
| 20–49 | Regular | Can create community foods (already possible) |
| 50–74 | Trusted | Foods they create start at higher trustScore |
| 75–100 | Expert | Upvotes carry extra weight, can flag for review |

**Score factors:**
- +2 per community food created that reaches 10+ uses and stays ACTIVE
- +1 per upvote received on their foods
- −3 per report against their foods that causes demotion to PENDING
- +1 per valid report they filed (target food subsequently demoted)
- −1 per report they filed that was ignored (food remained ACTIVE with stable trustScore)

**Initial trustScore for new community food:**
```
initialTrust = 0.5 + (creatorReputation / 500)  // capped at 0.8
```

A new food from an Expert user (rep 80) starts at `0.5 + 0.16 = 0.66` instead of 0.5.

### 2.4 Upvote/Confirm Mechanism

Alongside the existing report endpoint (`POST /api/food/community/:id/report`), add:

- **Explicit upvote**: `POST /api/food/community/:id/upvote` — one per user per food. Boosts `upvotesCount` on the food and `totalUpvotesReceived` on the creator. Upvote weight scales with voter reputation.
- **Implicit confirmation**: When a user logs a community food (creates a FoodEntry with source COMMUNITY) and does NOT subsequently report it, this counts as a weak implicit confirmation. Already tracked via `usesCount` — no new infrastructure needed.

### 2.5 Schema Additions

**On User model:**
```
reputationScore       Float   @default(50.0)   // 0-100
totalContributions    Int     @default(0)
totalUpvotesReceived  Int     @default(0)
totalReportsFiled     Int     @default(0)
validReportsFiled     Int     @default(0)
reportsAgainstUser    Int     @default(0)
```

**New model:**
```
CommunityFoodUpvote {
  id, communityFoodId, userId, createdAt
  @@unique([communityFoodId, userId])
}
```

**On CommunityFood:**
```
upvotesCount    Int    @default(0)
```

### 2.6 Groundwork That Can Be Laid Now

1. **Reputation fields on User**: Schema migration — additive columns with defaults, no behavior changes.
2. **CommunityFoodUpvote model + endpoint**: `POST/DELETE /api/food/community/:id/upvote`.
3. **Track report validity**: When a report causes ACTIVE → PENDING, mark the reporter's `validReportsFiled`.
4. **Reputation computation service**: `computeReputation(userId)` queries metrics and computes score. Called lazily on profile view and community food creation.

### 2.7 Phasing

| Phase | Scope |
|---|---|
| A | Schema migration (reputation fields, upvote model). Upvote endpoint. Passive metric tracking. |
| B | Reputation computation service. Score exposed on profile API. Tier display in UI. |
| C | Reputation influences initial trustScore. Weighted upvotes. Search ranking integration. |
| D | Moderation tools. Admin dashboard. Report validity feedback loop. |

---

## 3. Recipe Sharing & Meal Prep Portioning

### 3.1 Vision

**Personal side**: A user makes a batch of chili — 6 servings. They create a saved meal with all the ingredients, set total servings to 6. Over the week, they log 1 serving at a time. Each serving is 1/6 of the total macros. The app tracks how many servings remain.

**Community side**: Users can publish recipes to a separate community recipe system. A recipe includes: food items with quantities, preparation instructions, total yield, tags, and optionally a cover photo. Community members browse, search, rate, and fork recipes. Forking creates a personal copy that can be customized.

### 3.2 Why Separate From Community Foods

Community foods and community recipes serve different purposes:

| | Community Food | Community Recipe |
|---|---|---|
| **What** | Single food item with nutrition data | Composite of multiple foods with instructions |
| **Example** | "Trader Joe's Greek Yogurt" | "High-Protein Overnight Oats" |
| **Trust model** | Nutrition accuracy (are the macros right?) | Combination accuracy (do the ingredients and portions make sense?) |
| **Logging** | Log directly as one entry | Log as N entries (one per ingredient), scaled by portion |
| **Discovery** | Search by food name | Browse by tags, meal type, dietary preference |

Merging these into one system would create confusion in search results and require overloading the trust model to cover both nutrition accuracy and recipe quality.

### 3.3 Current State

`SavedMeal` and `SavedMealItem` models exist and are functional. `LogMealRequest` supports `scaleFactor` — the server already scales each item's macros by this factor. What's missing:

- `totalServings` on SavedMeal (needed for portioning math: `scaleFactor = selectedServings / totalServings`)
- Portioning UI on LogMealSheet (servings picker when `totalServings` is set)
- Community recipe infrastructure (entirely new)

### 3.4 Portioning Workflow (Personal Meals)

```
1. User creates a SavedMeal: "Weekly Chili Batch"
2. Adds ingredients: ground beef 2lb, beans 2 cans, tomatoes 1 can, ...
3. Sets totalServings: 6
4. Over the week, opens "Log Saved Meal" → selects "Weekly Chili Batch"
5. Picker shows: "Servings: [1] of 6" (default 1)
6. Taps "Log" → scaleFactor = 1/6 → each ingredient logged at 1/6 quantity
7. App tracks: 5 servings remaining
```

The existing `scaleFactor` infrastructure handles the math. The new work is:
- A `totalServings` field on SavedMeal
- A servings picker UI when `totalServings` is non-null
- A computed "servings remaining" query (count distinct `mealInstanceId` values for this `savedMealId`)

### 3.5 Community Recipe Schema (Future)

```
CommunityRecipe {
  id, name, description, instructions (text/markdown),
  totalServings (Float), tags (String[]), coverImageUrl,
  createdByUserId, forkedFromId,
  status (ACTIVE/PENDING/RETIRED),
  trustScore, ratingsCount, avgRating, usesCount,
  createdAt, updatedAt
}

CommunityRecipeItem {
  id, recipeId, name, quantity, unit,
  calories, proteinG, carbsG, fatG,
  source, usdaFdcId?, customFoodId?, communityFoodId?,
  sortOrder
}

CommunityRecipeRating {
  id, recipeId, userId, rating (1-5), comment?,
  createdAt
  @@unique([recipeId, userId])
}
```

### 3.6 Groundwork That Can Be Laid Now

1. **`totalServings` + `description` on SavedMeal**: Schema migration. Null means "no portioning, behave as before."
2. **Portioning UI on LogMealSheet**: When `totalServings` is non-null, show a servings picker. Compute `scaleFactor = selected / totalServings`.
3. **Meal creation: totalServings input**: Optional "Total servings" field in MealCreationView.
4. **Servings remaining query**: Count `FoodEntry` rows with `savedMealId` grouped by `mealInstanceId`.

### 3.7 Open Questions

- **Partial servings**: Should users be able to log 1.5 servings? The `scaleFactor` already supports any float, so the math works — question is whether the UI should allow it.
- **Recipe versioning**: If a user forks a community recipe and the original is updated, should the fork be notified? Or are forks completely independent?
- **Voice integration**: "Log one serving of my chili" in Kitchen Mode requires resolving "my chili" to a SavedMeal. The existing `lookup_food` function in Gemini Live would need a parallel `lookup_recipe` function declaration.
- **Recipe import**: Should users be able to paste a URL (AllRecipes, etc.) and have the app parse ingredients? This is a separate feature but a natural extension.

### 3.8 Phasing

| Phase | Scope |
|---|---|
| A | `totalServings` on SavedMeal, portioning UI, servings picker, servings remaining. Personal meal prep complete. |
| B | CommunityRecipe/Item/Rating models. CRUD API routes. Basic browse and search. |
| C | Fork/customize. Ratings. Integration with user reputation (Feature 2) for trust and ranking. |
| D | Voice integration: "log my chili, one serving" in Kitchen Mode. Recipe import from URLs. |

---

## 4. Day Validation & AI Insights Pipeline

### 4.1 Vision

The user finishes logging for the day and taps "Validate day" — marking the data as complete and accurate. A data quality score is computed: what percentage of entries were scale-confirmed, what percentage came from trusted sources.

Over time, validated days accumulate. Rule-based insights run continuously, detecting patterns that the user may not notice themselves. The critical insight class is **metabolic red flags** — situations where the user's behavior is counterproductive to their goals but they don't realize it.

Long-term, the validated data corpus is fed to an LLM for deeper pattern analysis that rule-based systems cannot catch.

### 4.2 The Metabolic Adaptation Problem

This feature is directly motivated by a real experience: dieting too aggressively (large caloric deficit) while doing excessive cardio, causing weight loss to stall and chronic exhaustion — without realizing the cause. This is a well-documented physiological response (adaptive thermogenesis / metabolic adaptation), and it's exactly the kind of pattern that a system with enough high-quality data can detect and flag.

**Detection rule:**
All conditions must be true simultaneously:
1. Current goal is CUT (from GoalTimeline)
2. Average caloric intake over past 14 validated days is >500 cal below goal target
3. Weight trend (`weeklyRateKg` from WeightEntry) has been within ±0.1 kg/week for 2+ weeks (plateau)
4. Activity level is MODERATE or higher (from User profile)
5. Pattern has persisted for at least 14 days

**Output**: A high-priority warning insight explaining the likely cause and suggesting a diet break or reduced training volume.

### 4.3 Data Quality Scoring

Each validated day receives a quality score (0–1):

```
dataQualityScore =
  (scaleConfirmedPct × 0.4) +       // 40%: scale confirmation
  (trustedSourcePct × 0.3) +         // 30%: trusted food sources (custom + high-trust community)
  (completenessScore × 0.2) +        // 20%: reasonable total cals (not a 200-cal day)
  (consistencyScore × 0.1)           // 10%: entries spread through day, not one bulk entry
```

Quality scores serve two purposes:
1. **User feedback**: "Your data quality is 85% this week" motivates scale use and careful logging
2. **AI pipeline input**: Higher-quality validated days are weighted more heavily in pattern analysis

### 4.4 Rule-Based Insight Rules

Extending the existing `InsightsStore` (which already computes streak, protein goal streak, calorie trend, and consistency insights):

| Rule | Trigger | Severity | Data Required |
|---|---|---|---|
| **Metabolic adaptation** | CUT + large deficit + weight plateau + high activity for 14+ days | Critical | GoalTimeline, WeightEntry, FoodEntry summaries, User.activityLevel |
| **Over-restriction** | Average intake >25% below goal for 2+ weeks, goal aggressiveness is AGGRESSIVE | Warning | GoalTimeline, FoodEntry summaries |
| **Protein imbalance on cut** | CUT goal + protein consistently <90% of target | Warning | GoalTimeline, FoodEntry summaries |
| **Day-of-week pattern** | Weekend intake >40% higher than weekday average | Info | FoodEntry summaries (grouped by day of week) |
| **Deficit erosion** | CUT goal, but 3 of last 7 days exceeded maintenance | Info | GoalTimeline, FoodEntry summaries |
| **Scale confirmation declining** | Scale-confirmed % has decreased over last 2 weeks | Info | FoodEntry.confirmedViaScale |

### 4.5 The AI Pipeline (Long-Term)

Once a sufficient corpus of validated days exists (50+), the data can be periodically analyzed by an LLM. The key constraint from the project's core principle applies: **the LLM analyzes behavioral patterns in validated data, it does NOT generate or estimate nutrition values.** This is consistent with Gemini's role as a parser, not a nutritionist.

The AI pipeline would:
- Receive a structured summary of validated days (macros, goals, weight trend, activity level, quality scores)
- Identify patterns that rule-based insights cannot: correlations between specific food choices and goal adherence, seasonal patterns, impact of travel/schedule changes
- Generate natural-language observations and suggestions
- Suggest goal adjustments based on observed trends ("Your weight has been stable for 6 weeks at your current intake — your maintenance calories appear to be around X")

This requires careful prompt engineering and should be behind a user opt-in.

### 4.6 Schema Additions

**New model:**
```
DayValidation {
  id, userId, date (unique per user+date),
  validated (Boolean, default true),
  dataQualityScore (Float?),
  scaleConfirmedPct (Float?),
  trustedSourcePct (Float?),
  entryCount (Int),
  notes (String? — user can add context like "ate out, estimated portions"),
  createdAt
}
```

**Expanded DailySummaryItem response:**
```
scaleConfirmedCount?: number
communitySourceCount?: number
customSourceCount?: number
validated?: boolean
dataQualityScore?: number
```

### 4.7 Groundwork That Can Be Laid Now

1. **DayValidation model**: Schema migration. Simple model with no behavior changes.
2. **Validate day endpoint**: `POST /api/days/:date/validate` creates/updates a DayValidation record, computes quality metrics from that day's FoodEntries. `GET /api/days/:date/validation` returns status.
3. **Expand summary endpoint**: Add `scaleConfirmedCount` and source distribution to the existing daily summary query (backward-compatible, new fields are optional).
4. **GoalType in summary response**: The summary endpoint already fetches GoalTimeline to resolve macro targets — extend the response to include `goalType` and `aggressiveness` for each day.
5. **New rule-based insights**: Extend `InsightsStore.computeInsights()` with the metabolic adaptation and over-restriction rules. All required data (GoalTimeline, WeightEntry, FoodEntry summaries, User.activityLevel) already exists in the app's stores.

### 4.8 Phasing

| Phase | Scope |
|---|---|
| A | DayValidation model + endpoints. Expanded summary endpoint. GoalType in response. |
| B | Metabolic adaptation, over-restriction, protein imbalance, day-of-week pattern rules in InsightsStore. Validation UI on daily log. |
| C | Data quality dashboard. Calendar view integration (validation indicator on CalendarDayCell). Quality trend visualization. |
| D | AI pipeline: LLM review of validated corpus. Opt-in. Careful prompt engineering. Goal adjustment suggestions. |

---

## 5. Pantry & Macro-Aware Meal Suggestions

### 5.1 Vision

The user maintains a virtual pantry — a list of foods they currently have at home. The app knows what's available, knows the user's remaining macro targets for the day, and recommends snacks or meals that:

1. Can be made from what's actually in the pantry
2. Fill the remaining macro gap optimally (e.g., "you need 40g more protein — you have chicken breast and Greek yogurt")
3. Optionally match community recipes that use available ingredients

The pantry is a **planning and suggestion layer** on top of the existing logging system. Logging a food doesn't automatically deplete the pantry (portions are imprecise), but the user can manually mark items as used up or the app can suggest depletion based on logging patterns.

### 5.2 How It Works

```
1. User adds items to pantry: chicken breast, rice, broccoli, eggs, Greek yogurt, ...
2. Each pantry item links to a food reference (custom food, community food, or USDA)
3. At any point, user opens Pantry tab → "What can I eat?"
4. App checks remaining macros for today (from GoalTimeline - logged so far)
5. App scores pantry items by how well they fill the remaining gap:
   - Need 40g protein, 20g carbs? → chicken breast scores high, rice scores lower
6. Suggests individual items ("Snack: 200g Greek yogurt — fills 20g of your remaining protein")
7. Suggests combinations / recipes if available ("Dinner: Chicken stir-fry — uses chicken, rice, broccoli from your pantry")
```

### 5.3 Pantry Item Model

```
PantryItem {
  id, userId,
  name (String),
  foodRef (String? — "custom:uuid", "community:uuid", "usda:12345"),
  quantity (Float? — optional, e.g., "2 lbs" or just "have it"),
  unit (String?),
  calories (Float), proteinG (Float), carbsG (Float), fatG (Float),
  defaultServingSize (Float?), defaultServingUnit (String?),
  category (String? — "protein", "dairy", "grain", "produce", "snack", etc.),
  addedAt (DateTime),
  depletedAt (DateTime? — null = still available),
  userId → User

  @@index([userId, depletedAt])  // fast query for active pantry items
}
```

Key design choices:
- **Nutrition is denormalized** onto the pantry item (like SavedMealItem). This avoids re-fetching from USDA/community on every suggestion query.
- **Quantity is optional**. Some users will track "I have 2 lbs of chicken" precisely; others will just flag "I have chicken." Both modes work — quantity just enables smarter depletion tracking.
- **Category enables filtering** ("show me protein sources in my pantry that fit my remaining macros").

### 5.4 Macro-Aware Suggestion Engine

The suggestion engine is the core value of the pantry. It solves a constrained optimization: given remaining macros and available foods, what should the user eat?

**Scoring per pantry item:**
```
remainingProtein = goalProtein - loggedProtein
remainingCarbs = goalCarbs - loggedCarbs
remainingFat = goalFat - loggedFat
remainingCal = goalCal - loggedCal

For each pantry item at a standard serving:
  proteinFit = min(item.proteinG / max(remainingProtein, 1), 1.0)
  carbFit = min(item.carbsG / max(remainingCarbs, 1), 1.0)
  fatFit = min(item.fatG / max(remainingFat, 1), 1.0)
  calFit = 1.0 - abs(item.calories - (remainingCal * portionRatio)) / remainingCal

  // Penalize items that overshoot a macro
  overshootPenalty = sum of max(0, itemMacro - remainingMacro) for each macro

  score = weighted_sum(proteinFit, carbFit, fatFit, calFit) - overshootPenalty
```

This is a rule-based scorer, not AI. The AI insights pipeline (Feature 4 Phase D) could later generate more nuanced suggestions ("you tend to feel more satiated when your evening snack is high-fat — try the almonds over the yogurt").

**Combination suggestions** (if community recipes exist):
- Filter community recipes where >80% of ingredients match pantry items
- Rank by macro fit + recipe rating
- Show: "You can make High-Protein Stir Fry — uses chicken, broccoli, rice from your pantry. Fills 45g protein, 30g carbs."

### 5.5 Pantry Population Methods

| Method | Description | Phase |
|---|---|---|
| **Manual add** | Search for a food → "Add to pantry." Same search UI as food logging. | A |
| **Add from log** | After logging a food, option: "Add to pantry?" (for items you buy regularly) | A |
| **Fridge Scan** | Point camera at open fridge → multi-item detection → add identified items to pantry. Directly connects to `BUILD_PLAN.md` Phase 4 (Fridge Scan Mode). | Late |
| **Grocery list import** | Paste or photograph a grocery receipt → parse items → add to pantry. | Late |
| **Depletion from logging** | When you log a pantry item, optionally reduce quantity or mark as depleted. | B |

### 5.6 Connection to Fridge Scan Mode

`BUILD_PLAN.md` Phase 4 describes Fridge Scan Mode: point at an open fridge, multi-object detection identifies items, and macro tags are overlaid. The current description focuses on *showing macros on detected items*. The pantry feature extends this — detected items are not just displayed, they're **persisted as pantry inventory**. This makes Fridge Scan a pantry population tool, not just a viewing tool.

### 5.7 Open Questions

- **Depletion tracking precision**: Should logging a food auto-deplete from pantry? Risk: user logs "100g chicken" but has 2 lbs — auto-decrementing 100g from a vague "have chicken" entry is fragile. Safer approach: periodic "pantry check" prompt ("Do you still have chicken breast? Mark items you've used up").
- **Expiration tracking**: Should pantry items have an expiration date? Adds complexity but enables "use this soon" suggestions. Could be optional.
- **Household vs. personal**: If multiple users share a household, should the pantry be shared? Out of scope for single-user prototype, but worth noting for multi-user future.
- **Suggestion timing**: When should the app proactively suggest? After logging breakfast? At a set time? Only on demand? Notification-driven suggestions risk being annoying.

### 5.8 Groundwork That Can Be Laid Now

1. **PantryItem model**: Schema migration. Simple inventory model with food reference and optional quantity.
2. **CRUD endpoints**: `GET/POST/PUT/DELETE /api/pantry`. List active items, add from food reference, update quantity, mark depleted.
3. **"Add to pantry" action**: On the food detail / post-log screen, a button to add the food to pantry. Reuses existing food search and selection UI.

### 5.9 Phasing

| Phase | Scope |
|---|---|
| A | PantryItem model, CRUD endpoints, manual add + add-from-log UI. Basic pantry list view. |
| B | Macro-aware suggestion engine: "What should I eat?" scores pantry items against remaining macros. Depletion-on-log option. |
| C | Recipe integration: filter community recipes by pantry availability. Combination suggestions. |
| D | Fridge Scan population (depends on BUILD_PLAN.md Phase 4). Grocery receipt parsing. Expiration tracking. |

---

## 6. Cross-Feature Interactions

These five features form a reinforcing system:

```
Passive Mode (F1)                    User Reputation (F2)
     │                                       │
     │ increases confirmedViaScale rate       │ governs community food/recipe trust
     │                                       │
     ▼                                       ▼
Day Validation (F4) ◄──────────────► Recipe Sharing (F3)
     │                                       │
     │ validated data corpus                  │ recipe quality from reputation
     │                                       │
     ▼                                       ▼
AI Insights (F4D)                    Pantry (F5)
                                       │
                                       │ macro-aware suggestions
                                       │ + recipe filtering
                                       │
                                       ▼
                                  Fridge Scan (BUILD_PLAN Phase 4)
```

Specific interactions:
- **Passive mode → Data quality**: Auto-add with scale dramatically increases `confirmedViaScale` rate, improving day validation quality scores
- **Reputation → Recipe quality**: High-rep users' recipes rank higher; recipe reports feed into reputation
- **Validated days → AI insights**: The metabolic adaptation rule needs high-quality data to distinguish "user actually ate 1800 cal" from "user estimated 1800 cal but ate 2400"
- **Portioning + passive mode**: Weigh each batch ingredient passively, compare total against expected yield
- **Reputation → Trust → Data quality**: High-trust community foods score higher in day quality metrics
- **Pantry → Recipes**: Filter community recipes by pantry availability ("recipes you can make right now")
- **Pantry → AI insights**: Long-term, the AI pipeline can observe pantry contents + logging patterns ("you buy Greek yogurt weekly but rarely log it — are you forgetting to track it, or not eating it?")
- **Fridge Scan → Pantry**: Fridge Scan (BUILD_PLAN.md Phase 4) becomes a pantry population tool, not just a viewing tool
- **Pantry + Day validation**: Suggestions from pantry items that have been validated in past logs carry higher confidence

---

## 7. Implementation Priority

### Immediate (no dependencies, can start now)
1. **Meal prep portioning** (Feature 3 Phase A) — smallest scope, immediate user value
2. **Day validation model + quality metrics** (Feature 4 Phase A) — lays data foundation
3. **Reputation fields + upvote endpoint** (Feature 2 Phase A) — starts tracking
4. **Scale state machine + passive mode flag** (Feature 1 Phase A) — groundwork for passive mode
5. **Pantry model + CRUD + basic UI** (Feature 5 Phase A) — simple inventory, immediate utility

### Short-term (after groundwork)
6. **Metabolic adaptation + over-restriction insights** (Feature 4 Phase B) — high value, directly addresses user's pain point
7. **Pantry macro-aware suggestions** (Feature 5 Phase B) — "what should I eat?" engine
8. **Reputation computation + display** (Feature 2 Phase B)
9. **Auto-identification on scale stabilize** (Feature 1 Phase B) — with confirmation, not auto-add

### Medium-term
10. **Full passive auto-add with undo** (Feature 1 Phase C)
11. **Community recipes** (Feature 3 Phase B–C)
12. **Pantry + recipe integration** (Feature 5 Phase C) — filter recipes by pantry availability
13. **Reputation influences trust scores** (Feature 2 Phase C)

### Long-term
14. **AI insights pipeline** (Feature 4 Phase D)
15. **Fridge Scan → pantry population** (Feature 5 Phase D) — depends on BUILD_PLAN.md Phase 4
16. **Confidence refinement from correction history** (Feature 1 Phase D)
17. **Voice-integrated recipe logging** (Feature 3 Phase D)

---

*Last updated: March 2026. This document will be updated as features move from planning to development.*
