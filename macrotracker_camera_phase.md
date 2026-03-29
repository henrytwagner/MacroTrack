# MacroTrackerSwift — Camera Food Recognition Phase

## Context & Conversation Summary

This planning document synthesizes a conversation about Cal AI's acquisition by MyFitnessPal and what their technical approach reveals for MacroTrackerSwift's camera food recognition feature. The core takeaways from Cal AI:

- They use **multi-model routing** (Anthropic + OpenAI + RAG) rather than one model for all food types
- They use the **phone's depth sensor** for volume estimation, which is the primary accuracy differentiator vs. competitors
- Their **user-correction flywheel** improves accuracy over time across all users
- They were **photo-first from day one** — no legacy architecture to retrofit
- Their USDA/nutrition data sourcing is looser than MacroTrackerSwift's standard (we should not copy this)

---

## Current State

- **Barcode scanning**: Started (AVCaptureSession + AVCaptureMetadataOutput)
- **Camera food recognition**: Not started
- **Gemini Flash vision**: Referenced for earlier phases but not yet integrated into iOS logging flow
- **AVFoundation/AVAudioEngine conflict**: Identified as primary risk for Phase E (voice)

---

## Design Constraints

- Keep existing barcode scanner intact (AVCaptureMetadataOutput pipeline)
- USDA lookup remains the source of truth for all nutritional data
- iOS 17+ is an acceptable minimum deployment target
- No ARKit — stay on AVCaptureSession to avoid exclusive camera session conflict
- Do not use custom exception handlers for validation error handling

---

## Architecture: Camera + Depth + Gemini Pipeline

### Overview

```
[AVCaptureSession]
       |
       ├── AVCaptureMetadataOutput (existing barcode path — untouched)
       |
       └── AVCaptureVideoDataOutput (new: raw CMSampleBuffer frames)
                    |
           [CaptureCoordinator]
                    |
         ┌──────────┴──────────┐
         |                     |
  [DepthEstimator]     [FoodRecognitionService]
  VNGenerateDepth-      Gemini Flash Vision API
  ImageRequest          (image + depth context)
  (iOS 17+)                    |
         |                     |
         └──────────┬──────────┘
                    |
          [NutritionResolver]
          USDA FoodData Central
          lookup + portion math
                    |
          [LogEntryViewModel]
          User review + correction UI
```

### Layer-by-Layer Breakdown

---

#### 1. AVCaptureSession Extension

The existing `AVCaptureSession` for barcode scanning must **not** be reconfigured. Add a second output rather than replacing anything.

```swift
// Extend existing session setup — do NOT reinitialize the session
session.beginConfiguration()

let videoOutput = AVCaptureVideoDataOutput()
videoOutput.setSampleBufferDelegate(captureCoordinator, queue: DispatchQueue(label: "com.macrotracker.camera"))
videoOutput.videoSettings = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
]

if session.canAddOutput(videoOutput) {
    session.addOutput(videoOutput)
}

session.commitConfiguration()
```

**Key point**: `AVCaptureMetadataOutput` (barcode) and `AVCaptureVideoDataOutput` (food recognition) can coexist on the same session. No architecture change needed.

---

#### 2. DepthEstimator — VNGenerateDepthImageRequest (iOS 17+)

Rather than ARKit (which takes exclusive camera ownership) or TrueDepth (front camera only), use Apple's monocular depth estimation. This generates a depth map from any single RGB frame with no hardware dependency beyond iOS 17.

```swift
import Vision

class DepthEstimator {
    
    func estimateDepth(from pixelBuffer: CVPixelBuffer) async throws -> CVPixelBuffer {
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNGenerateDepthImageRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let result = request.results?.first as? VNDepthObservation else {
                    continuation.resume(throwing: DepthError.noResult)
                    return
                }
                continuation.resume(returning: result.pixelBuffer)
            }
            
            let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
    
    // Convert depth map to a normalized portion-size descriptor
    // This gives Gemini context about relative food volume
    func depthDescriptor(from depthBuffer: CVPixelBuffer) -> String {
        CVPixelBufferLockBaseAddress(depthBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthBuffer, .readOnly) }
        
        let width = CVPixelBufferGetWidth(depthBuffer)
        let height = CVPixelBufferGetHeight(depthBuffer)
        let centerRegion = extractCenterRegionStats(depthBuffer, width: width, height: height)
        
        // Return a simple descriptor Gemini can use as context
        return "Estimated depth profile: center avg \(centerRegion.mean)m, " +
               "range \(centerRegion.min)-\(centerRegion.max)m, " +
               "spread \(centerRegion.stddev)m"
    }
}
```

**Note on accuracy**: Monocular depth is less precise than LiDAR but sufficient for portion estimation heuristics. The goal is a rough scale signal, not millimeter accuracy. Gemini does the semantic heavy lifting.

---

#### 3. FoodRecognitionService — Gemini Flash Vision

Gemini Flash receives both the RGB image and the depth descriptor as context. This is the multi-modal prompt strategy — image + structured context gives better portion estimates than image alone.

```swift
import Foundation

struct FoodRecognitionResult: Codable {
    let items: [RecognizedFoodItem]
    let confidence: Double
    let portionNotes: String
}

struct RecognizedFoodItem: Codable {
    let name: String           // e.g. "grilled chicken breast"
    let estimatedGrams: Double // Gemini's portion estimate
    let usdaSearchQuery: String // optimized query for USDA lookup
}

class FoodRecognitionService {
    
    private let apiKey: String
    private let endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    
    func recognize(image: UIImage, depthDescriptor: String) async throws -> FoodRecognitionResult {
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            throw RecognitionError.imageEncodingFailed
        }
        let base64Image = imageData.base64EncodedString()
        
        let prompt = buildPrompt(depthDescriptor: depthDescriptor)
        
        let requestBody: [String: Any] = [
            "contents": [[
                "parts": [
                    ["text": prompt],
                    ["inline_data": [
                        "mime_type": "image/jpeg",
                        "data": base64Image
                    ]]
                ]
            ]],
            "generationConfig": [
                "response_mime_type": "application/json"
            ]
        ]
        
        // ... network call, parse JSON response into FoodRecognitionResult
    }
    
    private func buildPrompt(depthDescriptor: String) -> String {
        """
        You are a nutrition assistant helping identify food items and estimate portions from a photo.
        
        Depth context: \(depthDescriptor)
        
        Analyze the food in this image and respond with valid JSON only:
        {
          "items": [
            {
              "name": "descriptive food name",
              "estimatedGrams": 0,
              "usdaSearchQuery": "search term optimized for USDA FoodData Central"
            }
          ],
          "confidence": 0.0,
          "portionNotes": "brief explanation of how you estimated portions"
        }
        
        Rules:
        - Use the depth context to inform gram estimates (closer = larger portion)
        - usdaSearchQuery should be a clean ingredient name, not a brand
        - confidence is 0.0-1.0 reflecting how certain you are about identification
        - If multiple foods are present, include all of them as separate items
        - Do not invent nutritional values — only identify and estimate portions
        """
    }
}
```

---

#### 4. NutritionResolver — USDA as Source of Truth

Gemini identifies *what* the food is and *how much*. USDA provides the actual nutrition data. These responsibilities must never be mixed.

```swift
class NutritionResolver {
    
    // Existing USDA service (already in project)
    private let usdaService: USDAFoodService
    
    func resolve(recognitionResult: FoodRecognitionResult) async throws -> [LogEntryCandidate] {
        var candidates: [LogEntryCandidate] = []
        
        for item in recognitionResult.items {
            let usdaResults = try await usdaService.search(query: item.usdaSearchQuery)
            
            guard let bestMatch = usdaResults.first else { continue }
            
            // Scale USDA nutrition by Gemini's gram estimate
            let scaledNutrition = bestMatch.nutrition.scaled(toGrams: item.estimatedGrams)
            
            candidates.append(LogEntryCandidate(
                foodName: bestMatch.description,
                estimatedGrams: item.estimatedGrams,
                nutrition: scaledNutrition,
                usdaFoodId: bestMatch.fdcId,
                aiConfidence: recognitionResult.confidence,
                portionNotes: recognitionResult.portionNotes,
                isUserConfirmed: false  // always requires user review
            ))
        }
        
        return candidates
    }
}
```

---

#### 5. User Review + Correction UI

Every AI result **must go through a user review step** before logging. This is both a data integrity requirement (USDA source of truth principle) and the mechanism for building the correction flywheel.

```swift
struct FoodRecognitionReviewView: View {
    @Binding var candidates: [LogEntryCandidate]
    let onConfirm: ([LogEntryCandidate]) -> Void
    
    var body: some View {
        // Show each recognized item with:
        // - Food name (editable / searchable)
        // - Gram estimate with stepper (user can correct)
        // - Macro breakdown preview (calculated from USDA data)
        // - Confidence indicator (low confidence = more prominent edit affordance)
        // - "Add to log" vs "Search instead" per item
    }
}
```

**Correction data to capture locally** (per-user, not shared):
```swift
struct CorrectionRecord: Codable {
    let imageHash: String         // perceptual hash of the food photo
    let aiEstimatedGrams: Double
    let userCorrectedGrams: Double
    let usdaFoodId: String
    let timestamp: Date
}
```

Store these locally in CoreData. Over time, use them to bias Gemini's portion estimates via few-shot examples in the prompt for foods the user frequently corrects.

---

## CaptureCoordinator — Orchestration

```swift
class CaptureCoordinator: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    
    private let depthEstimator = DepthEstimator()
    private let recognitionService = FoodRecognitionService(apiKey: Config.geminiAPIKey)
    private let nutritionResolver: NutritionResolver
    
    var onRecognitionComplete: (([LogEntryCandidate]) -> Void)?
    
    // Called when user taps shutter — not on every frame
    func captureAndRecognize(sampleBuffer: CMSampleBuffer) {
        Task {
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
                  let image = UIImage(pixelBuffer: pixelBuffer) else { return }
            
            async let depthDesc = depthEstimator.estimateDepth(from: pixelBuffer)
            
            let descriptor: String
            do {
                let depthBuffer = try await depthDesc
                descriptor = depthEstimator.depthDescriptor(from: depthBuffer)
            } catch {
                descriptor = "Depth unavailable"  // graceful fallback
            }
            
            let recognitionResult = try await recognitionService.recognize(
                image: image,
                depthDescriptor: descriptor
            )
            
            let candidates = try await nutritionResolver.resolve(
                recognitionResult: recognitionResult
            )
            
            await MainActor.run {
                onRecognitionComplete?(candidates)
            }
        }
    }
}
```

---

## Implementation Phases

### Phase 1 — Foundation (no Gemini yet)
- Add `AVCaptureVideoDataOutput` to existing session
- Implement `DepthEstimator` with `VNGenerateDepthImageRequest`
- Validate depth maps are generated correctly on test devices
- Build `FoodRecognitionReviewView` shell (static, hardcoded test data)

### Phase 2 — Gemini Integration
- Implement `FoodRecognitionService` with structured JSON prompt
- Wire `CaptureCoordinator` to call Gemini on shutter tap
- Connect Gemini output to existing USDA lookup service
- End-to-end test: photo → depth → Gemini → USDA → review UI

### Phase 3 — Correction Flywheel
- Implement `CorrectionRecord` persistence in CoreData
- Build few-shot prompt injection from correction history
- Confidence-based UI: low confidence surfaces edit controls more prominently
- Analytics: track AI accuracy drift per food category

### Phase 4 — Polish
- Perceptual image hash for deduplication
- Offline graceful degradation (no Gemini = manual search fallback)
- iOS 17 availability gating with `#available(iOS 17, *)` guards
- Performance: depth estimation async so it doesn't block shutter response

---

## Key Technical Risks

| Risk | Mitigation |
|---|---|
| `VNGenerateDepthImageRequest` accuracy on complex plated meals | Use as a context signal only, not hard constraint on gram estimate |
| Gemini portion estimates diverging from reality | User review required before every log entry; correction flywheel tightens over time |
| iOS 17 minimum cuts off older devices | Gate behind `#available(iOS 17, *)`, fall back to image-only Gemini call |
| AVFoundation audio session conflict (Phase E voice) | Camera and voice are sequential UX flows, not simultaneous — no shared session needed |
| USDA search returning poor matches for Gemini's food names | `usdaSearchQuery` in Gemini prompt is explicitly an ingredient-optimized string, not the display name |

---

## What We Are NOT Copying from Cal AI

- **Self-reported accuracy without USDA backing**: Cal AI estimates nutrition directly from vision. MacroTrackerSwift always resolves to USDA data.
- **Shared correction data across users**: Our flywheel is per-user only — no aggregated model training.
- **Simultaneous multi-model routing**: We use Gemini Flash for everything initially. Multi-model routing (e.g. GPT-4o Vision as fallback) is a future optimization, not Phase 1 scope.
