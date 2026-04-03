# ARCHIVED: MacroTrack — Original React Native MVP Specification

> **This document is archived.** It describes the original React Native/Expo MVP (February 2026). The app has since migrated to SwiftUI and evolved far beyond this scope. See `CLAUDE.md` for current architecture and `BUILD_PLAN.md` for the long-term vision.

**Version**: 1.0 (MVP)
**Authors**: Henry Wagner, Ryan Kendra, Lucas Kellar
**Last Updated**: February 24, 2026

---

## 1. Product Overview

MacroTrack is a voice-first macronutrient tracking mobile app. Its core differentiator is a hands-free "Kitchen Mode" that lets users log meals by speaking naturally while cooking. The AI assistant parses speech into structured food lookups, matches against trusted data sources, and guides the user through any gaps — but never fabricates nutritional data.

### 1.1 Design Principles

- **Low friction**: Reduce the number of steps to log a meal. Experienced users should spend minimal time in the interface.
- **Voice-first, not voice-only**: Voice is the primary input method during cooking, but every action has a manual/touch fallback.
- **Data integrity**: Nutritional data comes exclusively from the USDA FoodData Central database or user-created custom foods. The AI never generates or estimates macro values.
- **Transparency**: The source of every food entry (USDA database vs user-created) is always visible.
- **Minimal learning curve**: Avoid information overload. Help the user learn as they use the app through conversational AI interaction.

### 1.2 MVP Scope

The MVP is a **single-user prototype** (no authentication) focused on proving the voice logging experience. It includes:

- Voice-first logging via Kitchen Mode
- Manual food logging via search
- USDA food database integration
- User-created custom foods
- Voice-guided custom food creation (hands-free)
- Daily macro tracking with goals
- Implicit meal categorization by time of day

### 1.3 First Launch Experience

On first launch, the user sees a brief **onboarding carousel** (2-3 screens):

1. **Welcome**: "MacroTrack helps you log meals by voice while you cook." Brief visual of Kitchen Mode.
2. **Set your goals**: Inline goal input fields (calories, protein, carbs, fat) so the user sets targets without needing to find the Goals tab. "Skip" option if they want to explore first.
3. **Start logging**: "Search for foods, or tap the mic to log by voice." CTA takes them to the Dashboard.

If the user skips goal setting, the Dashboard progress bars show in an empty/dimmed state with a prompt: "Set your daily goals to track progress."

The onboarding only shows once (persisted to local storage).

### 1.4 Explicitly Out of Scope (Post-MVP)

- User authentication / multi-user
- Longer-term trends / weekly or monthly history charts (day-by-day navigation IS in scope; aggregated trends are not)
- Deficit/excess suggestions ("try eating more protein")
- Saved meals / repeat meals as a first-class concept
- Batch cooking / meal prep / portioning workflows
- Barcode or nutrition label scanning
- AI-assisted onboarding / goal recommendation
- Leftovers workflow ("log 60% now, 40% later")
- Recipe creation and editing
- Social or gamification features
- Unit conversion (e.g., grams to cups)

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile App | React Native (Expo) | Expo Router for file-based routing |
| State Management | Zustand | Lightweight, minimal boilerplate |
| Text-to-Speech | Expo Speech | For AI clarification questions in Kitchen Mode |
| Speech-to-Text | On-device (iOS/Android built-in) | Via `expo-speech-recognition`; upgrade path to Google Cloud STT if accuracy is insufficient |
| Backend | Node.js, Fastify, TypeScript | Lightweight, strong real-time/streaming support |
| ORM | Prisma | Type-safe database access |
| Database | PostgreSQL | Relational, supports complex queries for frequent/recent foods |
| AI | Google Gemini API | Natural language parsing, intent detection, meal categorization |
| Food Data | USDA FoodData Central API | Free, comprehensive food nutrition database |
| Real-time | WebSocket (ws library) | For streaming parsed results during voice sessions |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native (Expo)                       │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ Dashboard  │  │    Log    │  │   Goals   │  ← 3 Tabs    │
│  └───────────┘  └─────┬─────┘  └───────────┘               │
│                       │                                      │
│              ┌────────┴────────┐                             │
│              │  Kitchen Mode   │  ← Full-screen immersive   │
│              │  (voice session)│                              │
│              └────────┬────────┘                             │
│                       │                                      │
│         On-device STT │  Expo Speech TTS                    │
└───────────────────────┼─────────────────────────────────────┘
                        │ WebSocket (transcript + parsed results)
┌───────────────────────┼─────────────────────────────────────┐
│              Node.js / Fastify Backend                       │
│                       │                                      │
│              ┌────────┴────────┐                             │
│              │  Food Parser    │                             │
│              │  (orchestrator) │                             │
│              └───┬─────────┬──┘                              │
│                  │         │                                  │
│         ┌────────┴──┐  ┌──┴────────┐                        │
│         │  Gemini   │  │   USDA    │                        │
│         │  Service  │  │  Service  │                        │
│         └───────────┘  └──────────┘                         │
│                                                             │
│              ┌─────────────────┐                            │
│              │   PostgreSQL    │                             │
│              │  (via Prisma)   │                             │
│              └─────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Data Flow — Voice Logging

1. User taps mic on Log tab → Kitchen Mode launches (immersive)
2. On-device speech recognizer activates, listens continuously with auto-segmentation on pauses
3. Each utterance segment (transcript text) is sent via WebSocket to the backend
4. Backend sends transcript + current draft context to Gemini → returns structured intent
5. For `ADD_ITEMS`: backend looks up each item: **custom foods → USDA → no match (voice-guided creation)**
6. Results streamed back via WebSocket → draft cards update on screen in real-time
7. User says "done" or taps Save → entries persisted → returns to Dashboard

### 3.2 Data Flow — Manual Logging

1. User types in search bar on Log tab
2. REST call to `/api/food/search` → returns custom foods + USDA results
3. User taps a result → FoodDetailSheet opens (full-height bottom sheet)
4. User sets quantity/unit, taps Add → REST call to `POST /api/food/entries`
5. Entry saved, user stays on Log tab

---

## 4. Navigation

Three bottom tabs. Kitchen Mode and Onboarding are full-screen modal overlays (hide tabs).

| Tab | Screen | Description |
|---|---|---|
| Dashboard | Home | Macro progress bars + daily food log grouped by meal |
| Log | Food Logging Hub | Search bar, frequent/recent foods, "Create Food" / "My Foods" buttons, mic button |
| Goals | Goal Setting | Daily calorie and macro targets |

On first launch, the Onboarding carousel displays before the tab navigation is shown.

---

## 5. Screen Specifications

### 5.1 Dashboard (Home Tab)

**Purpose**: At-a-glance view of daily macro progress and food log for a selected date.

**Layout**:

| Section | Content |
|---|---|
| Date Header (pinned top) | Displays selected date (e.g., "Tuesday, Feb 24"). Tappable to open a date picker. Left arrow (previous day) and right arrow (next day) for quick navigation. Defaults to today on app launch. |
| Macro Progress | Four progress bars: Calories, Protein, Carbs, Fat. Each shows current/goal + numeric remaining. Reflects the **selected date's** entries. |
| Food Log (scrollable) | Entries for the **selected date**, grouped under meal headers: Breakfast, Lunch, Dinner, Snack. |

**Date Navigation**:
- Left/right arrows step one day at a time
- Tapping the date text opens a calendar date picker for jumping to any date
- The selected date is stored in app state and persists across tab switches — when the user goes to the Log tab or launches Kitchen Mode, entries are logged to the currently selected date
- On app launch, the selected date always resets to today

**Food Entry Row**:
- Food name (left-aligned)
- Quantity + unit (e.g., "150g")
- Calorie count
- Source indicator icon: database icon (USDA) or user icon (custom)

**Interactions**:
- **Tap a food entry** → Opens EditEntrySheet (lightweight bottom sheet) with editable quantity, unit, and delete option. Works the same on past days as on today.
- **Swipe left on entry** → Quick-delete with confirmation. Works on any date.
- **Empty state (today)**: "No entries yet today. Tap the Log tab to get started."
- **Empty state (past day)**: "No entries for this day. You can add entries retroactively from the Log tab."

**Design**: Minimal, clean, generous white space. Apple Health aesthetic.

---

### 5.2 Log Screen (Log Tab)

**Purpose**: Single hub for all food logging — manual search, quick-add, custom food creation, and voice session entry.

**Layout (top to bottom)**:

| Element | Behavior |
|---|---|
| Search bar | "Search foods..." — queries custom foods AND USDA. Results replace Frequent/Recent sections inline. |
| "Create Food" button | Always visible below search bar. Opens CreateFoodSheet. |
| "My Foods" link | Near "Create Food". Opens the custom food library for browsing, editing, and deleting custom foods. |
| "Frequent" section | Most frequently logged foods (user's staples). Shows food name + last-used quantity. |
| "Recent" section | Last N foods logged, chronological (most recent first). Same row format. |
| Mic button | Large, prominent, fixed at bottom center. Launches Kitchen Mode. |

**Search Results Grouping**:
- **"My Foods"** header → custom food matches (listed first)
- **"Database"** header → USDA matches
- **No results** → "Create '[query]' as custom food" option (pre-fills name in CreateFoodSheet)

**Frequent/Recent Food Row**:
- Food name (tappable → opens FoodDetailSheet)
- Last-used quantity + unit
- "+" button (tappable → **instant log** with last-used quantity, no confirmation)

Two distinct tap targets per row: the food name (opens detail sheet) and the "+" (instant log).

**Manual Logging Flow**:
1. User types in search bar or taps a food name in Frequent/Recent
2. FoodDetailSheet slides up (full-height bottom sheet)
3. Shows: food name, source label, nutrition breakdown, quantity input, unit selector
4. User sets quantity, taps "Add"
5. Entry is saved to the **currently selected date** (from the Dashboard date header). Meal label is auto-assigned by time of day for today, or by reasonable default for past dates.
6. Sheet dismisses, user stays on Log tab for additional entries

**Date Context**: The Log tab shows a subtle indicator of which date entries will be logged to if it is not today (e.g., "Logging to: Feb 22"). This prevents confusion when the user has navigated to a past day on the Dashboard.

---

### 5.3 Kitchen Mode (Immersive Voice Session)

**Purpose**: Hands-free food logging while cooking. Full-screen, hides all navigation.

**Entry**: Tap mic button on Log tab.
**Exit**: Save (voice or tap), Cancel (voice or tap with confirmation), or navigate away (auto-save).
**Date**: Entries are logged to the currently selected date from the Dashboard. If logging to a past date, the macro summary bar at the top shows that date's context and a small date label is visible.

**Layout (top to bottom)**:

| Section | Content |
|---|---|
| Macro Summary Bar (pinned top) | Compact: "1,450 / 2,200 cal \| 85g P left \| 120g C left \| 30g F left". Updates **live** as draft items are added (projected totals = saved + draft). |
| Draft Meal Cards (scrollable center) | Cards pop in as food items are recognized. See card states below. |
| Listening Indicator (bottom) | Visual waveform or pulsing dot showing mic is active. |
| Controls (bottom) | "Save" and "Cancel" buttons flanking the listening indicator. |

**Draft Card States**:

| State | Appearance | Trigger |
|---|---|---|
| Normal | Food name, quantity + unit, calories/protein/carbs/fat, source icon (database/custom) | Successful match in custom foods or USDA |
| Clarifying | Card highlights/pulses, question text appears on the card (e.g., "How many?") | AI needs more info (ambiguous quantity for countable items) |
| Creating | Card shows food name with fields filling in one-by-one as user speaks nutrition info | No match found, user opted to create custom food by voice |

**Cards are tappable** for manual fallback editing (inline quantity field, unit selector, delete button). Creating cards can also be finished manually by tapping.

**Voice Interaction Protocol**:

The AI communicates via **text-to-speech** (Expo Speech) for fully hands-free operation. All TTS prompts are also displayed visually on the relevant card.

| User Says | AI Intent | System Behavior |
|---|---|---|
| "200 grams of chicken breast and a cup of rice" | `ADD_ITEMS` | Parse items, look up in custom foods → USDA. Add cards. |
| "add eggs" (no quantity) | `ADD_ITEMS` | Default to 1 serving, add card. User can correct. |
| "actually make that 3 eggs" | `EDIT_ITEM` | Update eggs card quantity to 3. |
| "not 30 grams, 13" | `EDIT_ITEM` | Update most recently discussed item to 13g. |
| "remove the butter" | `REMOVE_ITEM` | Remove butter card from draft. |
| [ambiguous countable item] | `CLARIFY` | Card highlights, TTS: "How many eggs?" |
| "done" / "save that" | `SESSION_END` | Save all draft items, return to Dashboard. |
| "cancel" | (client-side) | Confirmation prompt, then discard everything. |
| [unrecognized speech] | (error) | TTS: "I didn't catch that, could you say it again?" |

**USDA Match Selection (voice mode)**:
When USDA returns multiple results, the system auto-picks the most generic/common match silently. The user can correct by voice if the wrong variant was selected.

**Missing Quantity Handling**:
Default to 1 serving. Add the card immediately. User can correct by voice ("make that 200 grams") or by tapping the card.

---

### 5.4 Voice-Guided Custom Food Creation

**Trigger**: Food parser finds no match in custom foods or USDA during a voice session.

**Flow**:

| Step | TTS Prompt | User Response | Card Update |
|---|---|---|---|
| 1 | "I couldn't find '[food name]'. Would you like to create it?" | "yes" / "sure" / "go ahead" | "Creating" card appears with food name |
| 2 | "What's the serving size?" | "one cup" / "100 grams" | Serving size field fills in |
| 3 | "How many calories per serving?" | "350" | Calories field fills in |
| 4 | "How much protein?" | "25 grams" | Protein field fills in |
| 5 | "Carbs?" | "30 grams" | Carbs field fills in |
| 6 | "And fat?" | "12 grams" | Fat field fills in |
| 7 | "Got it. [Food name] has been added." | — | Card transitions to normal state, source = CUSTOM |

- If user says "no" / "skip it" at step 1, the item is dropped and the session continues.
- User can **tap the creating card** at any point to finish filling fields manually.
- The custom food is saved to the `CustomFood` table for future reuse.
- Optional nutrition fields (sodium, cholesterol, etc.) are not asked during voice creation — they can be edited later via the manual CreateFoodSheet.

---

### 5.5 FoodDetailSheet (Shared Component)

**Type**: Full-height bottom sheet.

**Used in two contexts**:

| Context | Header | Button | Extra |
|---|---|---|---|
| Adding from Log tab | Food name + source label (USDA / Custom) | "Add" | — |
| Editing from Dashboard | Food name + source label | "Save" | "Delete" option |

**Content**:
- Food name (large)
- Source label: "USDA Database" or "Custom Food"
- Nutrition table: Calories, Protein (g), Carbs (g), Fat (g) — per serving and per 100g
- Extended nutrition if available: sodium, cholesterol, fiber, sugar, saturated fat, trans fat
- Quantity input field
- Unit selector (grams, oz, cups, servings, slices, etc.)
- Action button (Add or Save)

---

### 5.6 CreateFoodSheet (Custom Food Creation — Manual)

**Type**: Full-height bottom sheet.

**Entry points**:
- "Create Food" button on Log tab
- "Create '[query]' as custom food" fallback in search results (pre-fills name)

**Fields**:

| Field | Required | Type |
|---|---|---|
| Name | Yes | Text |
| Serving size | Yes | Number + unit selector |
| Calories | Yes | Number |
| Protein (g) | Yes | Number |
| Carbs (g) | Yes | Number |
| Fat (g) | Yes | Number |
| Sodium (mg) | No | Number |
| Cholesterol (mg) | No | Number |
| Fiber (g) | No | Number |
| Sugar (g) | No | Number |
| Saturated Fat (g) | No | Number |
| Trans Fat (g) | No | Number |

Optional fields are in a collapsible "More details" section.

**On save**: Food is persisted to `CustomFood` table and immediately available in search, frequent, and recent lists.

---

### 5.7 EditEntrySheet (Dashboard Edit)

**Type**: Lightweight bottom sheet (not full-height).

**Trigger**: Tap a food entry on the Dashboard.

**Content**:
- Food name (read-only display)
- Quantity input (editable)
- Unit selector (editable)
- "Save" button
- "Delete" button

---

### 5.8 Goals Screen (Goals Tab)

**Purpose**: Set daily macro targets.

**Fields**:
- Calories (number input)
- Protein in grams (number input)
- Carbs in grams (number input)
- Fat in grams (number input)

**"Save" button** persists goals. These values feed the Dashboard progress bars and the Kitchen Mode macro summary bar.

---

### 5.9 Custom Food Management (My Foods)

**Access**: A "My Foods" link/button on the Log tab (near the "Create Food" button) opens a list of all user-created custom foods.

**List view**:
- All custom foods sorted alphabetically
- Each row shows: food name, calories per serving, serving size
- Tap a food → opens CreateFoodSheet in edit mode (all fields pre-filled, button reads "Save Changes")
- Swipe left to delete (with undo snackbar)

**Search**: The existing search bar on the Log tab already surfaces custom foods under the "My Foods" header, so this dedicated section is for browsing and managing the full library.

---

## 6. UX Behavior Specification

### 6.1 Action Feedback

- **Haptic feedback**: A brief haptic tap on all discrete actions: quick-add "+", save entry, delete entry, save goals, save/cancel Kitchen Mode session. No toast messages — keep the UI clean.
- **Undo snackbar**: Swipe-to-delete (on Dashboard entries or custom foods) shows a snackbar at the bottom: "[Food name] deleted. UNDO" for 5 seconds. If the user taps Undo, the entry is restored. If the snackbar expires, the delete is committed.
- **Kitchen Mode save**: Instant navigation to Dashboard after save. The Dashboard's updated macro progress bars and new entries serve as the confirmation.

### 6.2 Macro Progress Bar Overflow

When the user exceeds a macro target, the progress bar visually **overflows past 100%** in a distinct warning color (orange or red). The remaining text changes to show the overage (e.g., "300 over" in the warning color). This makes it instantly visible from a glance that a goal has been exceeded.

### 6.3 Screen Behavior During Kitchen Mode

- **Screen stays awake**: Keep-awake is enabled for the entire voice session. Essential for counter-distance readability.
- **Phone call / interruption**: Treated the same as navigating away — auto-save all draft entries, session completes. When the user returns, they land on the Dashboard with entries saved.
- **System notifications**: Banners may appear over the macro summary bar briefly. No special handling needed for MVP.

### 6.4 Search UX

- **Debounce**: 300ms after the user stops typing before sending the search request
- **Minimum characters**: 2 characters before searching (prevents excessive API calls)
- **Result limits**: Show up to 5 custom food matches ("My Foods") + up to 15 USDA matches ("Database"). Enough to be useful without overwhelming.
- **Loading state**: A subtle inline loading indicator below the search bar while results are fetching
- **Empty search**: When the search bar is cleared, Frequent and Recent sections reappear

### 6.5 Error Handling

| Scenario | User-Facing Behavior |
|---|---|
| Backend unreachable (app launch) | Dashboard shows cached data if available, or empty state with "Unable to connect to server. Check your connection." |
| Backend unreachable (mid-action) | Brief inline error message near the action that failed (e.g., below the Add button: "Couldn't save. Tap to retry.") |
| USDA API down/slow | Search shows custom food results normally, USDA section shows "Database search unavailable right now" |
| Gemini API fails mid-voice-session | TTS: "I'm having trouble processing that. You can try again or add items manually." Mic stays active. |
| WebSocket disconnects during Kitchen Mode | Auto-save all items processed so far. Show a brief message: "Connection lost. Your items have been saved." Return to Dashboard. |
| On-device STT fails to start | Show a message on the Kitchen Mode screen: "Microphone access is required. Check your settings." with a button to open system settings. |

### 6.6 Keyboard and Input

- **Search bar**: Standard text keyboard. Tapping the search bar scrolls it to the top and pushes content up.
- **Number inputs** (quantity, calories, macros in CreateFoodSheet/Goals): Numeric keyboard type.
- **Unit selector**: Horizontal scrollable pill/chip selector (grams, oz, cups, servings, slices, pieces). Most common units first.

---

## 7. Session State Model

Kitchen Mode voice sessions have three possible outcomes:

| Action | Trigger | Draft Entries | Custom Foods Created | Session Status |
|---|---|---|---|---|
| **Save / Done** | User says "done" or taps Save | Saved as FoodEntries | Kept permanently | `completed` |
| **Navigate Away** | User swipes back, presses home, etc. | **Auto-saved** (same as Done) | Kept permanently | `completed` |
| **Cancel** | User says "cancel" or taps Cancel | **Discarded** | **Discarded** (rolled back) | `cancelled` |

Cancel shows a confirmation prompt: "Discard [N] items?" before proceeding.

Navigate away and Save/Done are synonymous — there is no pending/paused draft state.

---

## 8. AI Behavior Specification

### 8.1 Role Definition

The AI (Google Gemini) is a **parser and assistant**, not a data source.

**The AI does**:
- Parse natural language into structured food item lookups (`{ name, quantity, unit }`)
- Detect user intent: add, edit, remove, clarify, create custom food, end session
- Auto-assign meal labels based on time of day
- Guide the user through voice-based custom food creation
- Handle corrections naturally ("not 30, 13")

**The AI does NOT**:
- Generate, estimate, or approximate nutritional data
- Suggest meals, recipes, or dietary changes (post-MVP)
- Make decisions without user confirmation for destructive actions

### 8.2 Gemini Prompt Context

Each request to Gemini includes:
- The current transcript segment
- The current draft state (list of items already in the draft)
- The current time of day (for meal label assignment)
- The current session state (normal, or mid-custom-food-creation for a specific item)

### 8.3 Intent Types

| Intent | Payload | Description |
|---|---|---|
| `ADD_ITEMS` | `[{ name, quantity, unit }]` | One or more food items to look up and add |
| `EDIT_ITEM` | `{ targetItem, field, newValue }` | Modify an existing draft item |
| `REMOVE_ITEM` | `{ targetItem }` | Remove an item from the draft |
| `CLARIFY` | `{ targetItem, question }` | Ask the user for missing/ambiguous info |
| `CREATE_FOOD_RESPONSE` | `{ field, value }` | User answered a nutrition question during custom food creation |
| `SESSION_END` | — | User indicated they are done |

### 8.4 Food Lookup Priority

When the food parser receives an `ADD_ITEMS` intent:

1. **Custom foods** (user's own) — fuzzy name match against `CustomFood` table
2. **USDA FoodData Central** — API search, auto-pick most generic/common result
3. **No match** — trigger voice-guided custom food creation flow

### 8.5 Meal Label Assignment

| Time of Day | Default Label |
|---|---|
| 5:00 AM – 10:59 AM | Breakfast |
| 11:00 AM – 1:59 PM | Lunch |
| 2:00 PM – 4:59 PM | Snack |
| 5:00 PM – 9:59 PM | Dinner |
| 10:00 PM – 4:59 AM | Snack |

The AI may override based on food context (e.g., "breakfast burrito" at 1 PM → Breakfast). These boundaries are configurable.

---

## 9. Database Schema

```
┌──────────────┐     ┌──────────────┐
│    User       │────│  DailyGoal   │
│               │     │  (1:1)       │
│  id (PK)      │     │  calories    │
│  name         │     │  proteinG    │
│  createdAt    │     │  carbsG      │
│               │     │  fatG        │
└──────┬───────┘     └──────────────┘
       │
       ├─────────────────────────────────┐
       │                                 │
┌──────┴───────┐              ┌──────────┴─────┐
│  FoodEntry   │              │  CustomFood     │
│  (1:many)    │              │  (1:many)       │
│              │              │                  │
│  id (PK)     │              │  id (PK)         │
│  userId (FK) │              │  userId (FK)     │
│  date        │              │  name            │
│  mealLabel   │              │  servingSize     │
│  name        │              │  servingUnit     │
│  calories    │              │  calories        │
│  proteinG    │              │  proteinG        │
│  carbsG      │              │  carbsG          │
│  fatG        │              │  fatG            │
│  quantity    │              │  sodiumMg?       │
│  unit        │              │  cholesterolMg?  │
│  source      │──(DATABASE   │  fiberG?         │
│  usdaFdcId?  │   or CUSTOM) │  sugarG?         │
│  customFoodId│              │  saturatedFatG?  │
│  createdAt   │              │  transFatG?      │
│              │              │  createdAt       │
└──────────────┘              │  updatedAt       │
                              └──────────────────┘
       │
┌──────┴───────┐
│ VoiceSession │
│ (1:many)     │
│              │
│ id (PK)      │
│ userId (FK)  │
│ startedAt    │
│ endedAt?     │
│ status       │──(active / completed / cancelled)
└──────────────┘
```

**`FoodEntry.source`** is an enum with two values: `DATABASE` (USDA) or `CUSTOM` (user-created food).

---

## 10. API Specification

### 10.1 REST Endpoints

**Goals**:
| Method | Path | Description |
|---|---|---|
| GET | `/api/goals` | Get current daily goals |
| PUT | `/api/goals` | Set/update daily goals |

**Food Entries**:
| Method | Path | Description |
|---|---|---|
| GET | `/api/food/entries?date=YYYY-MM-DD` | Get all entries for a given day |
| GET | `/api/food/entries/frequent` | Get most frequently logged foods |
| GET | `/api/food/entries/recent` | Get recently logged foods (last N) |
| POST | `/api/food/entries` | Log a food entry |
| PUT | `/api/food/entries/:id` | Edit an entry (quantity, unit) |
| DELETE | `/api/food/entries/:id` | Delete an entry |

**Custom Foods**:
| Method | Path | Description |
|---|---|---|
| GET | `/api/food/custom` | List all user's custom foods |
| POST | `/api/food/custom` | Create a custom food |
| PUT | `/api/food/custom/:id` | Edit a custom food |
| DELETE | `/api/food/custom/:id` | Delete a custom food |

**Search**:
| Method | Path | Description |
|---|---|---|
| GET | `/api/food/search?q=...` | Unified search: custom foods first ("My Foods"), then USDA ("Database") |

### 10.2 WebSocket Protocol

**Endpoint**: `/ws/voice-session`

**Client → Server Messages**:

```json
{ "type": "transcript", "text": "200 grams of chicken breast" }
{ "type": "save" }
{ "type": "cancel" }
```

**Server → Client Messages**:

```json
{ "type": "items_added", "items": [{ "id": "tmp-1", "name": "Chicken Breast", "quantity": 200, "unit": "g", "calories": 330, "proteinG": 62, "carbsG": 0, "fatG": 7.2, "source": "DATABASE", "mealLabel": "dinner" }] }
{ "type": "item_edited", "itemId": "tmp-1", "changes": { "quantity": 150 } }
{ "type": "item_removed", "itemId": "tmp-2" }
{ "type": "clarify", "itemId": "tmp-3", "question": "How many eggs?" }
{ "type": "create_food_prompt", "foodName": "Mom's chili", "question": "I couldn't find 'Mom's chili'. Would you like to create it?" }
{ "type": "create_food_field", "foodName": "Mom's chili", "question": "How many calories per serving?" }
{ "type": "create_food_complete", "item": { ... } }
{ "type": "error", "message": "I didn't catch that, could you say it again?" }
{ "type": "session_saved", "entriesCount": 5 }
{ "type": "session_cancelled" }
```

---

## 11. Project Structure

```
MacroTracker/
├── mobile/                              # React Native (Expo) app
│   ├── app/
│   │   ├── _layout.tsx                  # Root layout + 3-tab navigator
│   │   ├── (tabs)/
│   │   │   ├── index.tsx                # Dashboard (home)
│   │   │   ├── log.tsx                  # Log screen
│   │   │   └── goals.tsx               # Goals screen
│   │   ├── kitchen-mode.tsx             # Full-screen modal
│   │   └── onboarding.tsx              # First-launch onboarding carousel
│   ├── components/
│   │   ├── FoodDetailSheet.tsx          # Full-height bottom sheet (view/log food)
│   │   ├── CreateFoodSheet.tsx          # Full-height bottom sheet (create custom food)
│   │   ├── EditEntrySheet.tsx           # Lightweight bottom sheet (edit from Dashboard)
│   │   ├── DraftMealCard.tsx            # Draft card in Kitchen Mode (normal/clarifying/creating states)
│   │   ├── MacroProgressBar.tsx         # Single progress bar
│   │   ├── MacroSummaryBar.tsx          # Compact bar for Kitchen Mode top
│   │   ├── FoodEntryRow.tsx             # Entry row on Dashboard (swipeable)
│   │   ├── FoodSearchResult.tsx         # Search result row on Log tab
│   │   ├── FrequentFoodRow.tsx          # Frequent/recent row with quick-add "+"
│   │   ├── MealGroup.tsx               # Meal header + entries group
│   │   ├── ListeningIndicator.tsx       # Mic active visual
│   │   ├── CustomFoodList.tsx           # My Foods library (browse/edit/delete custom foods)
│   │   ├── DateHeader.tsx              # Date navigation (prev/next arrows + date picker)
│   │   └── UndoSnackbar.tsx            # Temporary undo bar for delete actions
│   ├── services/
│   │   ├── api.ts                       # REST API client
│   │   ├── voiceSession.ts             # WebSocket client for voice sessions
│   │   └── speech.ts                    # On-device STT + Expo Speech TTS helpers
│   ├── stores/
│   │   ├── dateStore.ts                # Selected date (shared across Dashboard, Log, Kitchen Mode)
│   │   ├── draftStore.ts               # Kitchen Mode draft state
│   │   ├── dailyLogStore.ts            # Dashboard data + frequent/recent
│   │   └── goalStore.ts                # Goal targets
│   ├── constants/
│   │   └── theme.ts                    # Colors, typography, spacing
│   └── package.json
│
└── server/                              # Node.js (Fastify) backend
    ├── src/
    │   ├── routes/
    │   │   ├── food.ts                  # Entry CRUD + unified search + frequent/recent
    │   │   ├── customFood.ts            # Custom food CRUD
    │   │   └── goals.ts                 # Goals CRUD
    │   ├── services/
    │   │   ├── gemini.ts                # Gemini API client + prompt templates
    │   │   ├── usda.ts                  # USDA FoodData Central client
    │   │   └── foodParser.ts            # Orchestrator: transcript → structured items
    │   ├── websocket/
    │   │   └── voiceSession.ts          # WebSocket handler + session state machine
    │   ├── db/
    │   │   └── prisma/
    │   │       └── schema.prisma        # Database schema
    │   ├── app.ts                       # Fastify app setup + plugin registration
    │   └── server.ts                    # Entry point
    └── package.json
```

---

## 12. Implementation Order

| Phase | What | Validates |
|---|---|---|
| 1 | Scaffold monorepo (Expo + Fastify), TypeScript configs, 3-tab navigation shell | Project builds and runs |
| 2 | Prisma schema + PostgreSQL connection | Data layer works |
| 3 | USDA FoodData Central service | External API integration |
| 4 | Gemini service + prompt templates | AI parsing works in isolation |
| 5 | Food parser orchestrator (Gemini + USDA + custom food lookup) | Full parsing pipeline |
| 6 | REST API (goals, food entries, custom foods, search) | Backend feature-complete |
| 7 | Goals screen | End-to-end mobile ↔ backend proof |
| 8 | FoodDetailSheet + CreateFoodSheet components | Shared UI components ready |
| 9 | Dashboard (progress bars, meal groups, edit sheet, swipe delete) | Core daily tracking |
| 10 | Log screen (search, frequent/recent, quick-add, Create Food button) | Manual logging complete |
| 11 | WebSocket voice session handler (backend) | Real-time pipeline ready |
| 12 | Kitchen Mode (STT, WebSocket, draft cards, TTS, voice editing, custom food creation, save/cancel/auto-save) | Voice logging complete |
| 13 | Polish (error states, loading indicators, empty states, visual refinement) | Production-quality feel |

---

## 13. Future Integrations (Garmin, Apple Health)

- **Garmin (Garmin Connect / Garmin Health APIs)**:
  - **Scope**: Treat Garmin as an authoritative source of **activity and energy expenditure**, not as a destination for detailed food logs.
  - **Ingest** (read-only): daily summaries (active + resting calories), workouts (type, duration, calories, heart rate), steps, intensity minutes, sleep and stress metrics where available.
  - **Use in MacroTrack**:
    - Drive more accurate TDEE estimates and dynamic calorie/macro targets.
    - Power “net calories” and “activity-aware” insights (e.g., “You’ve burned 650 active calories so far today.”).
    - Inform Kitchen Mode macro summary and guidance without ever fabricating nutrition data.
  - **Write-back**: No planned push of detailed nutrition data into Garmin; integration is primarily **Garmin → MacroTrack**.

- **Apple Health (HealthKit)**:
  - **Scope**: Two-way integration for **activity** and **nutrition**, with Health as a central hub that aggregates data from devices and apps.
  - **Ingest** (read): workouts, active and basal energy burned, steps, distance, flights climbed, body metrics (e.g., weight, body fat), and nutrition summaries written by other apps (calories, macros, selected micronutrients).
  - **Export** (write): MacroTrack food entries as HealthKit nutrition samples (dietary energy, protein, carbs, fat, and any additional nutrients we track), tagged by time and meal context.
  - **Use in MacroTrack**:
    - Adjust daily targets and insights based on Apple Watch and other Health data.
    - Optionally surface combined intake (MacroTrack + other Health nutrition sources), with clear attribution and no double-counting.
  - **User control**: Fine-grained, opt-in permissions for what is read/written, clear explanations in onboarding and settings.

- **Design Constraints**:
  - External data (Garmin/Health) is used to **inform goals and insights** (calorie budgets, net calories, trend analysis), but **never as a source of food-level nutrition values**. All per-food macros remain sourced from USDA or user-created custom foods.
  - Integrations should be architected as optional, isolate-able modules so the core logging experience works fully offline and without any third-party connections.

