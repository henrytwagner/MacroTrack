# Dialed: Long-Term Build Plan
### Toward a Hands-Free, Camera-Assisted, Scale-Integrated Nutrition Logger

*Status: Active development. This document is a living research artifact — it captures vision, motivation, and phased implementation strategy. Specific technical details for later phases will be filled in as earlier phases mature.*

---

## Abstract

Manual food logging is the single largest barrier to sustained nutrition tracking. Users abandon apps not because they stop caring about their diet, but because the friction of searching, estimating portion sizes, and typing values into forms is simply too high to maintain across every meal. This project is an attempt to eliminate that friction entirely.

Dialed is a macro tracking application being built around three converging input modalities: a Bluetooth scale for ground-truth quantity measurement, a phone camera for visual food identification, and a voice interface for confirmation and command. The central thesis is that a phone, pointed at food on a scale, with a running voice session, can provide a logging experience more accurate and less disruptive than any existing solution — including early AR glasses prototypes — without requiring specialized hardware.

The following document describes the motivation, observations, architecture, and phased build strategy for realizing this vision.

---

## 1. Motivation and Problem Space

### 1.1 The Estimation Problem

Every mainstream nutrition tracker today relies on user estimation for quantity. Users are asked to identify their food in a database and then input a quantity — "1 cup," "3 oz," "2 servings." Both steps are error-prone. Food databases have inconsistent entries (one app's "chicken breast, cooked" may mean a 3-oz serving; another's may mean 6 oz). Portion estimation without a scale is notoriously inaccurate even among trained users.

The consequence is that the data users track may not meaningfully reflect what they ate. Caloric variance of ±30% between estimated and actual intake is common in the literature. This undermines the core value proposition: if the data is noisy, the feedback is noisy.

### 1.2 The Friction Problem

Even apps that encourage scale use require the user to: (1) weigh the food, (2) open the app, (3) search for the food, (4) enter the weight, (5) confirm the entry. This is a five-step sequence per food item, repeated for every ingredient in a meal. For a home cook preparing three or four components for a single dinner, this adds up to a meaningful interruption.

Voice input, implemented in the current version of this app as the primary logging modality, eliminates steps 2–4 for identified foods. Kitchen Mode already provides a hands-free transcript-to-draft-card pipeline. But voice alone doesn't solve quantity — the user still has to say a number.

### 1.3 The Opportunity

The gap is quantity without effort. If the app already knows what the food is (camera or barcode) and already knows how much there is (scale), voice becomes a simple confirmation layer rather than a full input channel. The logging interaction collapses to: *put food on scale → glance at phone → say "add it."*

This is the interaction model this project is building toward.

---

## 2. Product Positioning: The Phone as AR Window

There is a class of product being developed under the "AR glasses" umbrella that attempts to overlay nutritional information on your visual field as you look at food. These products face significant adoption barriers: cost, social acceptability (wearing a camera on your face in public or in a kitchen with others), and the cognitive overhead of a heads-up display in a task-focused environment.

The phone-as-AR-window is a deliberate positioning response to this. A phone you pick up, point at your food, and put down is:

- Socially familiar — no one looks twice at someone using their phone in a kitchen
- Intentional — the act of picking up the phone is a deliberate logging gesture, not passive surveillance
- Accessible — no additional hardware beyond what users already own
- Accurate — the phone screen is a large, high-resolution display suitable for overlaid macro information

The core AR vision — floating macro tags on identified items in the camera frame, live weight readout, real-time caloric computation — is achievable on a modern smartphone. The experience just requires the right pipeline behind it.

A potential product framing: *"The AR nutrition experience, without the glasses."*

---

## 3. Current State

### 3.1 What Exists

As of April 2026, the following is functional:

- **Macro tracker core**: Daily log, goal tracking, food database (USDA FoodData Central + community foods), custom food creation, saved meals, and macro progress dashboard. Built on a native SwiftUI iOS client (iOS 17+, Swift 5.9) and a Fastify/TypeScript/PostgreSQL/Prisma backend.

- **Voice input pipeline (Gemini Live streaming)**: On-device VAD (voice activity detection) captures audio via `AVAudioEngine` with a pre-roll buffer (~300ms before VAD fires). Audio is resampled to 16 kHz int16 mono and streamed as `audioChunk` messages over WebSocket. The server forwards audio to Gemini 2.5 Flash, which returns structured intent objects and spoken audio responses. Supported intents: `ADD_ITEMS`, `EDIT_ITEM`, `REMOVE_ITEM`, `CLARIFY`, `CREATE_FOOD_RESPONSE`, `CONFIRM_FOOD_CREATION`, `DISAMBIGUATE_CHOICE`, `SESSION_END`, `QUERY_HISTORY`, `LOOKUP_FOOD_INFO`, `SUGGEST_FOODS`, `ESTIMATE_FOOD`, `CLEAR_ALL`, `CANCEL_OPERATION`, `UNDO`, `REDO`. Gemini audio responses are played back via `AVAudioPlayerNode` with gapless frame tracking. Echo suppression buffers capture while Gemini is speaking. **Current pain point**: voice command reliability and Gemini's food recall accuracy are the largest UX friction — this is the active development focus.

- **Kitchen Mode UI**: Full-screen immersive logging session with hero/compact card animations. Draft cards support three visual states: `normal`, `clarifying` (pulsing highlight, question prompt), and `creating` (progressive field fill during custom food creation). Inline editing with live quantity preview. Manual nutrition entry fallback. Macro progress pill with expandable breakdown. Session exit options: save (persist all drafts) or cancel (discard drafts and delete session-created custom foods).

- **BLE Scale integration (complete)**: CoreBluetooth `BluetoothScaleService.swift` with Etekcity ESN00 protocol fully decoded. Live weight streaming with stable/measuring indicators. Software zero offset with persistence across card switches. Subtractive weighing mode (before/after delta for shared dishes). Scale-to-draft integration: new items automatically activate weighing mode when their base unit is weight. Weight changes update macro values in real time.

- **Auto-progression (complete)**: Configurable stability-based auto-confirm (default 3s). Chain-confirm triggers: barcode scan, voice item arrival, or timer expiry during active weighing. Auto-zero on confirm (stores raw reading as next zero reference). Visual feedback (flash animation + haptic + optional system sound). All settings persisted via UserDefaults with a settings sheet in Kitchen Mode.

- **Camera food identification (photo-tap, complete)**: Live camera preview via `KitchenCameraSession` (AVFoundation dual-output architecture). User taps capture button → photo compressed and sent as base64 to server → Gemini Flash vision identifies food → result routed through standard `foodParser.ts` lookup pipeline → draft card created. Frame buffer access architecture in place for future CoreML integration.

- **Barcode scanner (fully integrated)**: VisionKit `DataScannerViewController` with AVFoundation fallback for GTIN types (EAN-8, EAN-13, UPC-E). Integrated into food search flow and inline in Kitchen Mode. Duplicate-scan protection (same GTIN within 2s rejected). Barcode scan triggers auto-confirm of current weighing item. GTIN pre-fills barcode field during custom food creation.

- **Nutrition label scanning (complete)**: On-device OCR via Vision framework (`NutritionLabelScanner`). Captured label sent to server `/api/nutrition/label/parse` → Gemini parses structured nutrition data → `NutritionLabelParser` validates and normalizes → pre-fills `CreateFoodSheet` fields.

- **Community foods**: Full CRUD with state tracking (ACTIVE/PENDING/RETIRED). Integrated into food search results with visual indicators. Voting and reporting API endpoints.

- **Saved meals**: Create, list, log, and delete meals. Per-item source tracking. Meal logging with optional scale factor (0.5x, 1.5x portions).

### 3.2 Key Architectural Decisions Already Made

- **Gemini is a parser, not a nutritionist.** The LLM never generates or estimates nutritional values. It only parses user intent from transcripts. All nutrition data comes from USDA FoodData Central or user-created custom foods. This constraint is baked into the system prompt and enforced as a project invariant.

- **Full authentication.** Apple Sign-in, email/password registration, JWT access/refresh tokens, password reset. Auth middleware on all API routes. `defaultUser.ts` is deprecated.

- **Voice-first but not voice-only.** Tap confirmation and manual entry are always present throughout the UI. The voice pipeline is primary, not mandatory.

- **Touch is a first-class input, not a fallback.** Every action that can be done by voice or camera can also be done by tap. This is a deliberate design constraint, not a concession. The goal is that any combination of modalities works: voice + camera, scale + tap, voice only, tap only. A user who doesn't want to speak shouldn't have to. A user who can't use the camera should have a complete experience. The richest experience uses all three, but no single modality is required.

---

## 3.3 Accessibility as a Design Consequence

The multi-modal input architecture has an important secondary benefit: it is a strong foundation for accessibility.

Because every logging action is reachable via multiple input paths, the app naturally accommodates users with different physical and cognitive needs. Some concrete observations:

- A user who is **non-verbal or prefers not to use voice** in a given context can log entirely through tap and camera. The camera + scale pipeline requires zero text input and zero voice — just point and tap.

- A user with **motor limitations** who finds precise tapping difficult may find voice confirmation easier. "Add it" is a lower-motor-demand action than hitting a small on-screen button.

- A user who is **deaf or hard of hearing** loses nothing — voice input is optional and the UI communicates entirely visually. All feedback is visual (draft cards, overlay text, status indicators). Audio feedback should be optional and additive, never the sole feedback channel.

- A user with **low vision** benefits from the large, readable AR overlay cards and the ability to confirm by voice without needing to read small UI elements.

- The **fridge scan mode** and visual food ID pipeline could be particularly useful for users with **cognitive or memory-related conditions** who struggle to recall nutritional information — the app surfaces it passively from the environment without requiring recall or search.

None of these are features that need to be designed from scratch — they emerge naturally from the "every action is multi-modal" constraint. The implementation requirement is to maintain this constraint rigorously as features are built: always ask "can this be done without voice? without touch? without vision?" and ensure the answer is yes wherever possible.

It is worth naming an observation that goes beyond design constraint: the camera + scale logging pipeline — point phone at food, read weight, say one word — may be the most accessible food logging modality ever built for users with motor or cognitive limitations. Existing apps require search, typing, and quantity estimation. This pipeline requires none of those. The user's physical and cognitive load is reduced to: place food, point phone, confirm. For a user with limited fine motor control, significant cognitive load, or conditions that make text entry difficult, this is a qualitatively different experience. This is worth framing explicitly as a research contribution angle, not just a design property. The accessibility benefits are not an accommodation added to a mainstream product — they are a structural consequence of the core architecture.

Formal accessibility audit (screen reader support, dynamic text sizing, contrast ratios, VoiceOver/TalkBack compliance) is a later phase concern, but designing with this framing from the start avoids the refactor cost of retrofitting accessibility after the fact.

---

## 4. The Three Input Pillars

### 4.1 Scale: Quantity Ground Truth

The Bluetooth scale provides the accuracy anchor for the entire system. Rather than asking the user to estimate "about 6 ounces," the scale reads live weight in grams and sends it via BLE notifications (not polling — the scale pushes updates automatically when the value changes).

A key behavioral signal is the zero-out event. When a user removes an item from the scale and it returns to zero (or near-zero), this can trigger a "new item ready" state. The app can use this as a natural transition point: the previous item is confirmed and logged, and the system is ready for the next.

**Before/after eating weight delta (feature idea, suggested by Prof. Guo, March 2026):** Rather than only weighing food before eating, the user can weigh the plate (or container) before and after eating, and the app logs the difference as the consumed quantity. This is especially useful for meals eaten from a shared dish or bowl, where pre-portioning is inconvenient. Implementation: the user tares/weighs before eating, eats, then re-weighs; the app computes and logs `weight_before - weight_after`. The UX would expose this as a "weigh remainder" mode alongside the standard weighing flow.

The hardest implementation problem is byte packet decoding. Each scale manufacturer uses a proprietary BLE packet format. There is no standard. Protocol reverse engineering typically involves:
1. Connecting to the scale via nRF Connect or LightBlue
2. Observing raw notifications from the weight characteristic
3. Finding community-documented formats on GitHub (search: `[scale model name] BLE protocol`)
4. Writing a parser from sample packets

Once a working parser exists for the target scale model, the `BluetoothScaleService.swift` class exposes a clean Combine publisher stream that the rest of the app consumes.

### 4.2 Camera: Food Identification

Two distinct identification pathways are planned depending on food type:

**Barcode scan** — For packaged foods. Already built as a standalone module. The barcode is decoded, normalized to GTIN-13, and used to query a nutrition database (USDA FoodData Central, Open Food Facts, or Nutritionix depending on coverage). This pathway is reliable and high-accuracy for packaged goods.

**Visual food recognition** — For produce, whole foods, and prepared items without barcodes. A two-phase approach has been settled on after evaluating the available options:

*Phase 1 — Gemini Flash vision (photo-tap logging):* The user taps a camera button, takes a photo, and the image is sent to the existing `gemini.ts` service as a base64-encoded frame with a structured identification prompt. Gemini returns a JSON food name, which routes directly into the existing `foodParser.ts` USDA lookup flow. No new dependencies. Slots into the current architecture in hours. Latency (~500–1000ms) is acceptable for a deliberate photo-tap interaction; it rules out live AR but is invisible in a tap-to-log flow. Gemini is also the recommended off-device fallback model for any phase where on-device inference is unavailable or insufficient.

*Phase 2 — AVFoundation + on-device model (live AR frames):* `AVCaptureVideoDataOutput` delivers `CVPixelBuffer` per frame on a dedicated serial queue with no bridge overhead. **Recommended on-device model options (per faculty review, March 2026):**

- **YOLO v10 / v11 / YOLO-World** — Prof. Guo's primary recommendation for on-device food detection. YOLO-World is particularly compelling because it supports open-vocabulary detection (arbitrary text labels at inference time rather than a fixed class list), which means it can handle novel food items without retraining. YOLO v10/v11 are strong choices for standard object detection if the class set is fixed. All variants export to CoreML (`.mlmodelc`) and run on the Neural Engine. Expected inference latency: ~30–60ms per frame.
- **ARKit** — For Phase 3 AR anchoring specifically, ARKit's built-in scene understanding (plane detection, object anchoring) can provide spatial stability for overlay cards and may offer bounding-box primitives that reduce the vision model's anchoring workload.
- **EfficientNetB0 fine-tuned on Food-101** — The original plan; still viable as a lightweight single-label classifier if YOLO proves overkill for the Phase 2 use case (single food item on a scale, not fridge scan). Revisit once YOLO is benchmarked.

AR overlays will be drawn using SwiftUI `Canvas` or `RealityKit` anchored on the AVFoundation camera feed.

*Why specialized nutrition APIs (Passio AI, LogMeal) were evaluated and rejected:* These platforms bundle nutrition data delivery with their vision inference. Passio's SDK, for example, couples an on-device CoreML vision model with a mandatory cloud call to fetch `PassioFoodItem` nutrition data after every identification. The tokens you pay for are mostly this cloud nutrition fetch — which Dialed discards, since nutrition data comes from USDA and user-created sources. You cannot cleanly extract just the food name without triggering the billing layer their SDK is designed around. LogMeal is purely cloud-based and has the same data-bundling problem. Both create per-call cost for a data layer this app intentionally owns independently.

**AR overlay** — Identified items in the camera frame are annotated with floating macro cards rendered using SwiftUI overlays on AVFoundation camera preview. Full ARKit spatial anchoring is not required — 2D bounding boxes from the vision model output are sufficient for the intended UX. The overlay renders: food name, confidence score, and live macro computation bound to the current scale weight (updating in real time as the weight changes).

### 4.3 Voice: Confirmation and Command

Voice is the primary input modality. The voice pipeline now uses **Gemini Live streaming** — continuous audio streaming rather than batched transcript segments. The client streams raw audio chunks over WebSocket, the server forwards them to Gemini 2.5 Flash, and Gemini returns both structured intent JSON and spoken audio responses that are played back to the user.

In the AR-integrated flow, voice will be repurposed from a full input channel to a confirmation layer. The interaction vocabulary simplifies:

- *"Add it"* / *"Yes"* — confirm the identified item at current weight
- *"Skip"* / *"No"* — dismiss the current item
- *"What's that?"* — trigger clarification (read the identified food name aloud)
- *"Cancel"* — abort current item
- *"Done"* / *"Save"* — end session

Tap confirmation is always available as a fallback for noisy environments or user preference.

**Current pain point (active focus, April 2026):** Voice command reliability and Gemini's food recall/understanding accuracy are the largest UX friction. The continuous streaming architecture is in place (per the faculty recommendation from March 2026), but the quality of Gemini's responses — correctly identifying foods from conversational speech, recalling previously logged items, and handling ambiguous or corrective utterances — is the primary area of ongoing work.

---

## 5. Core Logging Flow (Target State)

The end-to-end interaction the system is being built toward:

```
1. User places food item on scale
2. Scale pushes live weight via BLE → app displays weight in real time
3. User holds phone over food → camera feed opens
4. App identifies food:
   a. If barcode detected → query nutrition DB → instant match
   b. If no barcode → send frame to vision model → classification returned
5. Identified food + live weight → macros computed in real time
6. AR overlay appears: floating macro card on identified item
   (e.g., "Chicken breast — 187g — P: 35g  C: 0g  F: 4g  Cal: 179")
7. User confirms: "Add it" (voice) or tap checkmark
8. Entry logged → scale zeroed → session ready for next item
```

Total user effort per food item: place food, point phone, say one word.

---

## 6. Additional Modes

### 6.1 Fridge Scan Mode

Point the camera at an open refrigerator. The app identifies multiple products simultaneously — packaged goods via barcode, visible fresh items via vision model — and overlays macro tags on each identified item.

Secondary capability: given the user's daily macro goals and current intake, the app can highlight items in the fridge that would best complete their remaining targets. *"You're 40g of protein short — the Greek yogurt on the second shelf has 17g."*

This is a passive nutrition advisor mode. The user isn't actively logging; they're getting contextual guidance from their environment.

### 6.2 Multi-Object Tagging

The video feed runs continuous food detection and renders live bounding boxes with macro previews on all identified items simultaneously. Useful for a meal that's already plated — scan the plate and see a breakdown of each component before eating.

This mode is computationally heavier and will likely require on-device inference (Core ML model via Passio AI SDK) rather than round-trip API calls to avoid latency that breaks the real-time feel.

---

## 7. Phased Build Plan

### Phase 0: Foundation ✅
*Complete.*

- [x] Monorepo scaffold (SwiftUI iOS app + Fastify + shared types)
- [x] PostgreSQL/Prisma data layer
- [x] USDA FoodData Central integration
- [x] Gemini voice parsing pipeline (upgraded to Gemini Live streaming)
- [x] Kitchen Mode UI (draft cards, WebSocket session, hero/compact animations)
- [x] Barcode scanner (VisionKit + AVFoundation, integrated into Kitchen Mode)
- [x] BLE scale stream (CoreBluetooth, Etekcity ESN00 protocol decoded)
- [x] Community foods (CRUD, voting, reporting)
- [x] Saved meals (create, log, scale factor)
- [x] Nutrition label scanning (Vision OCR + Gemini parsing)

---

### Phase 1: Prove the Pipeline ✅
*Complete. BLE + Barcode + Voice Confirm + Camera photo-tap + Auto-progression.*

**Goal**: End-to-end logging without estimation. ✅ Achieved.

**Completed work**:
- [x] BLE byte packet parser for Etekcity ESN00
- [x] Scale stream integrated into Kitchen Mode with live weight on draft cards
- [x] Barcode scanner wired into Kitchen Mode session flow
- [x] Voice confirmation flow via Gemini Live
- [x] Auto-progression: stability-based auto-confirm, chain-confirm on new item arrival, auto-zero
- [x] Camera photo-tap food identification via Gemini Flash vision (Phase 1 of §4.2)
- [x] Subtractive weighing mode (before/after weight delta)

**Remaining open question**:
- Whether to use USDA, Open Food Facts, or Nutritionix for barcode-to-nutrition lookup (coverage and latency tradeoffs)

---

### Phase 2: Visual Food Identification (Partially Complete)
*Photo-tap via Gemini vision is working. On-device real-time model is next.*

**Goal**: Point camera at a banana, app identifies "banana," scale provides weight, macros computed.

**Completed**:
- [x] Photo-tap identification via Gemini Flash vision (capture → base64 → server → Gemini → foodParser lookup → draft card)
- [x] Camera preview integrated into Kitchen Mode (`KitchenCameraSession`)
- [x] Frame buffer access architecture in place for CoreML integration

**Remaining work**:
- On-device YOLO v10/v11/World CoreML model for real-time frame-by-frame detection (eliminates round-trip latency)
- Confidence threshold UX: below threshold → ask user to confirm or correct identification
- Fallback chain: on-device model → Gemini vision → barcode → manual entry
- Latency of cloud API round-trip vs on-device inference for real-time feel
- How to handle ambiguous identifications (e.g., "apple" — which variety? does it matter for macros?)

---

### Phase 3: AR Overlays
*Float macro tags on identified items in the camera frame.*

**Goal**: Point phone at food on scale → see a floating overlay card with food name and live-updating macros as weight changes.

**Work items**:
- Camera feed rendering pipeline (AVFoundation)
- Bounding box detection on identified items (Vision framework or model output)
- Overlay rendering: transparent card with food name, confidence, macro breakdown
- Live weight binding: macro numbers update in real time as scale weight changes
- Visual design for the overlay (must feel native and non-cluttered)

**Notes**: Full ARKit spatial anchoring is likely overkill here. A simpler approach — draw 2D overlay rectangles on the camera preview using the bounding box coordinates from the vision model — achieves the desired visual effect without the complexity of 3D scene understanding.

---

### Phase 4: Fridge Scan and Multi-Object Mode
*Wide scan, multiple simultaneous items, passive nutrition advisor.*

**Goal**: The "wow" demo. Point at a fridge, see macro tags on everything. Highlight items that match remaining daily goals.

**Work items**:
- Multi-item detection pipeline (run vision model on full frame, handle multiple bounding boxes)
- Per-item nutrition lookup for all detected items simultaneously
- Remaining macros computation → item highlighting logic
- UX design for a cluttered frame with many overlapping labels
- Performance optimization (this is the most compute-intensive mode)

**Open questions**:
- How many simultaneous items can be reliably identified and rendered without the UI becoming unreadable?
- On-device inference requirement for acceptable frame rate?

---

## 8. Technical Stack

| Capability | Technology | Status |
|---|---|---|
| Mobile framework | SwiftUI (iOS 17+, Swift 5.9) | Established |
| Backend | Fastify + TypeScript + PostgreSQL/Prisma | Established |
| Voice parsing + audio | Gemini 2.5 Flash (native audio preview) | Established |
| Speech-to-text | Gemini Live (server-side, audio streaming via GeminiLiveService) | Established |
| Nutrition database | USDA FoodData Central | Established |
| BLE scale stream | CoreBluetooth (native, no wrapper) | Complete |
| Barcode scan | VisionKit DataScannerViewController + AVFoundation | Complete |
| Visual food ID (Phase 1) | Gemini Flash vision (photo → base64 → gemini.ts) | Complete |
| Visual food ID (Phase 2) | AVFoundation AVCaptureVideoDataOutput + YOLO v10/v11/World CoreML or EfficientNetB0 | Not started |
| AR overlays | SwiftUI Canvas / RealityKit on AVFoundation feed | Not started |
| Packaged food DB | Open Food Facts / Nutritionix | Not started |

---

## 9. Observations and Open Research Questions

The following are observations from the design process that don't have settled answers yet. They are recorded here to inform future decisions.

**On scale protocol diversity**: The BLE packet format problem is non-trivial. It is not clear whether a single scale model can be committed to for the prototype or whether the architecture should be designed for pluggable parsers from the start. The latter is more engineering work upfront but avoids rework if the target scale changes.

**On vision model accuracy for produce**: Visual food recognition models vary significantly in their produce classification accuracy. A banana is easy; a roasted sweet potato is harder; a homemade grain bowl is very hard. The interaction design needs a graceful degradation path for low-confidence or failed identifications. This is partly a UX problem (how do you prompt the user to correct an identification without breaking the flow?) and partly a model selection problem.

**On live AR frame rate vs. accuracy tradeoff**: The on-device CoreML model can physically run faster than necessary — the question is what inference frequency makes the AR overlay *feel* live without draining battery. Food doesn't move quickly on a kitchen counter, so a 2–5fps inference cadence is likely sufficient to keep the overlay feeling responsive. Running at 30fps would be wasteful and thermally aggressive. The right frequency needs hands-on testing with the actual model and device to find the point where additional frames stop improving perceived responsiveness.

**On the Phase 1→Phase 2 data collection bridge**: Phase 1 photo-tap logs should capture three things alongside the food entry: the original image, the Gemini-returned food label, and the user's final confirmed food match (the USDA entry they accepted). This triplet — image, predicted label, confirmed label — is labeled training data for fine-tuning the Phase 2 CoreML model, collected with zero extra user effort. Over hundreds of logs, this builds a dataset biased toward the foods this specific user actually eats, which is more valuable for model accuracy than a generic Food-101 dataset. The data collection schema should be designed into Phase 1 even if the fine-tuning pipeline isn't built until Phase 2.

**On the zero-out event as a UX signal**: The design of using scale return-to-zero as a natural item boundary is appealing but has edge cases. What if the user picks up an item to look at it and sets it back down? What if the scale oscillates near zero? Debounce logic and a minimum-time-on-scale threshold will be needed. The right thresholds are unclear without hands-on testing.

**On multi-item detection for fridge scan mode**: The Phase 2 CoreML model (EfficientNetB0 fine-tuned on Food-101) is a single-label classifier — it returns one prediction per frame. This is architecturally incompatible with fridge scan mode, which requires identifying multiple objects simultaneously with individual bounding boxes. That task is object detection, not image classification — a fundamentally different model architecture (YOLO-style or similar). Phase 4 should plan for a separate model, separate frame processor plugin, and separate AR rendering logic. Do not attempt to extend the Phase 2 classification pipeline to cover Phase 4.

**On the phone-as-AR-window positioning**: This framing has been tested informally and resonates. The comparison to AR glasses is useful because it gives people a mental model of what the app is trying to do, without the baggage of "another macro tracker." Whether it survives contact with real users is unknown.

**On a UI-context agent for richer Gemini input (suggested by Prof. Guo, March 2026):** Currently, the Gemini intent parser receives: current transcript, draft items array, time of day, and session state. A richer architecture would add a dedicated "context agent" that observes the current UI state — which screen is active, what's on the scale, what the camera currently sees, what draft cards are visible — and packages this into a structured context object that is injected into every Gemini call. This decouples the context-building concern from the intent-parsing concern: the context agent is responsible for understanding *what is happening*, and the intent parser is responsible for understanding *what the user wants to do about it*. This is especially important as more input modalities (scale, camera, touch) are added — the intent parser should not need to know the details of how each modality encodes its state.

---

## 10. iPad as a Kitchen Display Platform

An iPad or iPad mini mounted in the kitchen is a compelling future target, particularly for the AR and camera-assisted logging phases. The form factor advantages are significant: a larger display makes AR overlay cards more readable at counter distance, the wider camera field of view can capture a full meal spread or fridge shelf in a single frame, and the device can sit in a stand hands-free while the user cooks — eliminating the "pick up phone, point, put down" gesture entirely.

**Why this matters for the AR vision specifically:**
- A mounted iPad running fridge scan or multi-object mode becomes a passive ambient display, not an active phone interaction. The user glances at it; it doesn't need to be held.
- AR overlays at iPad scale (especially iPad Pro's 12.9" display) are legible from across a kitchen counter without needing to lean in.
- The iPad mini form factor is particularly practical — small enough to prop against a backsplash or stick to a cabinet, large enough to display macro cards without squinting.

**Technical considerations for iPad support:**
- SwiftUI supports iPad natively; the primary work is layout adaptation (the current mobile-first layouts will need responsive breakpoints or a dedicated iPad layout for Kitchen Mode and the AR camera view).
- Split-view and Stage Manager compatibility may be worth targeting so the app can sit alongside a recipe app.
- The iPad's Neural Engine runs the same CoreML models as iPhone — YOLO and any other on-device vision models require no changes.
- A dedicated "kitchen stand mode" could be a distinct UI layout: larger draft cards, larger tap targets, persistent camera feed without needing to hold the device.

**Implementation order:** iPad support should be layered on after the core AR pipeline (Phase 3) is stable on iPhone. The camera and model stack will be identical; the work is primarily layout and UX adaptation. Target as a Phase 3.5 or Phase 4 parallel track.

---

## 11. Immediate Next Steps

1. **Improve voice command reliability and Gemini food recall** — The largest current pain point. Gemini Live streaming is in place, but the quality of food identification from conversational speech, handling of corrections/edits, and recall of previously logged items needs significant improvement. This is the primary development focus.

2. **On-device visual food ID (Phase 2 remaining)** — Integrate YOLO v10/v11/World CoreML model for real-time food detection without round-trip latency. The AVFoundation frame buffer architecture is ready; the model integration and inference pipeline are the remaining work.

3. **AR overlays (Phase 3)** — Float macro tags on identified items in the camera frame, bound to live scale weight. SwiftUI Canvas or RealityKit on the AVFoundation camera preview.

4. **Passive Kitchen Mode evolution** — Move from voice-first to observation-first: auto-add items by combining scale readings + camera identification, with voice as a correction channel. See `FEATURES_ROADMAP.md`.

---

*Last updated: April 2026. This document will be updated as phases complete and open questions are resolved.*
