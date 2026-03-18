## MacroTrack Roadmap

This document captures post-MVP features and improvements, organized by **priority** and **implementation complexity**.

### High Priority / High Complexity

- **Unit conversion support**
  - Add a flexible data model for unit conversions between common measures (e.g., grams ↔ cups ↔ pieces) for both USDA and custom foods.
  - Allow defining and editing conversions when a food is created or updated.
  - Integrate conversion-aware quantity/unit selection throughout the food creation, logging, and editing flows (Dashboard, Log, Kitchen Mode).

- **Meal support**
  - Promote meals to a first-class concept (beyond implicit time-of-day labels).
  - Let users define, name, and save meals composed of multiple foods.
  - Support reusing saved meals in manual logging and Kitchen Mode, and editing or deleting saved meals.
  - Add a **Meals** tab on the Log Food screen as the primary entry point for browsing, reusing, and managing saved meals (initially shipped as a placeholder tab).

- **Health integrations (Garmin, Apple Health)**
  - Add optional integrations for importing activity and energy expenditure from Garmin Connect / Garmin Health APIs and Apple Health (HealthKit).
  - Use external activity data to drive more accurate TDEE estimates, dynamic calorie/macro targets, and “net calories” views, while keeping all per-food nutrition sourced from USDA or custom foods.
  - For Apple Health specifically, support two-way sync: read workouts/energy and write MacroTrack nutrition entries as HealthKit samples, with granular, opt-in permissions.
  - Treat Garmin primarily as a read-only activity source (no expectation of rich nutrition write-back), architected as an optional module that doesn’t affect the core offline logging experience.

### Medium Priority / Medium Complexity

- **Goals history**
  - Evolve the goals model so users can change goals over time without retroactively altering previous days’ targets.
  - Persist goals with effective dates or ranges so historical days continue to display the goals that were active at that time.

### Medium Priority / Low–Medium Complexity

- **Improve scrolling log view**
  - Refine the Dashboard and Log tab scrolling behavior and layout for long days with many entries.
  - Consider performance improvements (e.g., virtualization) and UX enhancements (sticky headers, clearer meal grouping, smoother scroll behavior).

- **Add button dropdown on Log Food**
  - Turn the plus button on the Log Food screen into a dropdown entry point.
  - Support multiple add flows from one control: add custom food, add by barcode, and add meal (once meals are implemented).

### Kitchen Mode / voice session — possible options (discover & implement later)

These are candidate enhancements for the Kitchen Mode bottom row or voice session flow. Simple, hands-free–friendly, or input-oriented. Prioritize and implement as needed.

- **Undo last** — Remove the most recently added draft item. One tap; no leaving voice mode.
- **Redo** — Restore the last undone item. Pairs with undo.
- **Paste** — Add from clipboard: run clipboard text through the same parser/lookup as voice and add to draft. One tap.
- **Same as last** — Duplicate the most recent draft item (one more serving). One tap instead of saying “and another one.”
- **+1 on last** — Increment the last draft item’s quantity by 1 (e.g. 1 → 2 servings). One tap.
- **Clear all drafts** — One tap to drop every draft item in the session. Optional: hold-to-confirm or single “Clear all?” tap-to-confirm.
- **Yes / Confirm** — When the app is in a clarify or yes/no state (e.g. “Create this food?”), a tap = “yes” so the user doesn’t have to say it.

Other options discussed (input-oriented or environmental):

- **Flashlight** — Toggle device torch. One tap; helps in dim kitchens and with barcode scanning.
- **Read back / Summary** — One tap triggers TTS of the current draft list (e.g. “You have 3 items: …”). Stays in voice.
- **Timer** — Start a single cooking timer (e.g. 15 min) with one tap; notification when done.
- **Quieter mode** — Toggle to shorten or soften TTS confirmations.
- **Keyboard / type input** — Tap to type one line (e.g. “200g chicken breast”); same pipeline as voice. Alternative input without leaving session.
- **Photo input** — Take or pick a photo of food; send for description (e.g. vision) then parse + lookup like voice.

