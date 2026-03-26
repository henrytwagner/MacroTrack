import SwiftUI
@preconcurrency import AVFoundation
import Observation

// MARK: - Session State

enum KitchenModeSessionState: Equatable {
    case idle
    case connecting
    case active
    case saving
    case cancelled
    case error(String)
}

// MARK: - KitchenModeViewModel

/// Manages the Kitchen Mode session lifecycle: WebSocket connection,
/// audio capture/playback, and UI state coordination.
/// Port of kitchen-mode.tsx state machine (lines 180–350).
@Observable
@MainActor
final class KitchenModeViewModel {

    // MARK: - Public State

    private(set) var sessionState: KitchenModeSessionState = .idle

    /// Derived listening state for the ListeningIndicator.
    var listeningState: ListeningState {
        if case .error = sessionState { return .idle }
        if isPaused { return .paused }
        if AudioPlaybackService.shared.isGeminiSpeaking { return .geminiSpeaking }
        if AudioCaptureService.shared.vadActive { return .capturing }
        if AudioCaptureService.shared.isCapturing { return .capturing }
        return .idle
    }

    /// Whether the user has manually paused voice.
    private(set) var isPaused = false

    /// Text display mode for caption/edit bar.
    enum TextDisplayMode { case off, captions, editing }
    var textDisplayMode: TextDisplayMode = .off
    var editText: String = ""

    /// Barcode mode (camera section).
    private(set) var barcodeModeActive = false

    /// Camera permission granted (checked on first barcode mode activation).
    private(set) var cameraPermissionGranted = false

    /// Camera facing direction — exposed for UI (flip button highlight).
    var cameraFacing: AVCaptureDevice.Position { camera.cameraPosition }

    /// Flash/torch state — exposed for UI.
    var flashEnabled: Bool {
        get { camera.torchEnabled }
        set { camera.torchEnabled = newValue }
    }

    /// Set of item IDs where the user tapped "Skip" on the scale chip.
    var scaleSkippedIds: Set<String> = []

    /// Currently-editing card ID (nil = no card in edit mode).
    var editingItemId: String? = nil

    /// Whether the macro pill is expanded to show detailed progress.
    var macroPreviewExpanded = false

    /// Live-updated quantity from the inline editor (nil when not editing).
    var editingQuantity: Double? = nil

    // MARK: - Dependencies (singletons)

    private let ws = WSClient.shared
    private let capture = AudioCaptureService.shared
    private let playback = AudioPlaybackService.shared
    private let camera = KitchenCameraSession.shared
    private let draft = DraftStore.shared
    private let dailyLog = DailyLogStore.shared
    private let dateStore = DateStore.shared
    private let goalStore = GoalStore.shared

    /// True once the session has ended (save/cancel/disconnect) — prevents double-close.
    private var sessionEnded = false

    // MARK: - Computed

    /// Items reversed so newest appears at top.
    var reversedItems: [DraftItem] {
        draft.items.reversed()
    }

    /// The "active" card: first non-normal card, or topmost card.
    var activeId: String? {
        reversedItems.first(where: { $0.state != .normal })?.id ?? reversedItems.first?.id
    }

    var projectedTotals: Macros {
        draft.projectedTotals
    }

    /// Projected totals adjusted for the live-edited quantity.
    /// Swaps the editing item's stored macros with scaled macros so it isn't double-counted.
    var liveProjectedTotals: Macros {
        guard let editId = editingItemId,
              let editQty = editingQuantity,
              let item = draft.items.first(where: { $0.id == editId }),
              item.quantity > 0
        else { return projectedTotals }

        let scale = editQty / item.quantity
        let delta = Macros(
            calories: item.calories * (scale - 1),
            proteinG: item.proteinG * (scale - 1),
            carbsG:   item.carbsG   * (scale - 1),
            fatG:     item.fatG     * (scale - 1))
        return Macros(
            calories: projectedTotals.calories + delta.calories,
            proteinG: projectedTotals.proteinG + delta.proteinG,
            carbsG:   projectedTotals.carbsG   + delta.carbsG,
            fatG:     projectedTotals.fatG     + delta.fatG)
    }

    var captionText: String {
        draft.captionText
    }

    var items: [DraftItem] {
        draft.items
    }

    /// Date label for non-today logging.
    var dateLabel: String? {
        let today = todayString()
        let date = dateStore.selectedDate
        guard date != today else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let d = formatter.date(from: date) else { return nil }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        return "Logging to \(display.string(from: d))"
    }

    // MARK: - Session Lifecycle

    /// Start the Kitchen Mode session: fetch data, connect WS, start audio.
    func startSession() async {
        guard case .idle = sessionState else { return }
        sessionState = .connecting

        // Load today's entries and goals for projected totals
        await dailyLog.fetch(date: dateStore.selectedDate)
        await goalStore.fetch(date: dateStore.selectedDate)

        // Initialize draft with current saved totals
        draft.initSession(savedTotals: dailyLog.totals)

        // Request mic permission
        let micGranted = await capture.requestPermission()
        guard micGranted else {
            sessionState = .error("Microphone access required for Kitchen Mode.")
            return
        }

        // Start audio playback engine
        do {
            try playback.startEngine()
        } catch {
            sessionState = .error("Audio playback failed: \(error.localizedDescription)")
            return
        }

        // Wire WS message handler
        ws.onMessage = { [weak self] msg in
            self?.handleServerMessage(msg)
        }
        ws.onDisconnect = { [weak self] _ in
            guard let self, !self.sessionEnded else { return }
            self.sessionState = .error("Connection lost. Your items have been saved.")
            self.stopAudio()
        }

        // Connect WebSocket
        ws.connect(date: dateStore.selectedDate)

        // Start audio capture
        do {
            try capture.start()
        } catch {
            sessionState = .error("Microphone start failed: \(error.localizedDescription)")
            return
        }

        // Keep screen awake
        UIApplication.shared.isIdleTimerDisabled = true

        sessionState = .active
    }

    /// Save the session — server persists entries, sends session_saved.
    func save() {
        guard !sessionEnded else { return }
        sessionState = .saving
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        capture.stop()
        camera.stop()
        barcodeModeActive = false
        ws.send(.save)
        // Navigation triggered by session_saved from server
    }

    /// Cancel the session — server deletes custom foods, sends session_cancelled.
    func cancel() {
        guard !sessionEnded else { return }
        // No items → just close without confirm
        if items.isEmpty {
            performCancel()
            return
        }
        // Otherwise, caller should show confirmation alert first, then call performCancel()
    }

    /// Actually send cancel to server.
    func performCancel() {
        guard !sessionEnded else { return }
        sessionEnded = true
        sessionState = .cancelled
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        stopAudio()
        camera.stop()
        barcodeModeActive = false
        ws.send(.cancel)

        // Fallback: if session_cancelled never arrives, clean up after 1.8s
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1800))
            self.draft.reset()
        }
    }

    /// Send a manual text transcript (from card buttons or edit bar).
    func sendTranscript(_ text: String) {
        ws.send(.transcript(text: text))
    }

    /// Send barcode scan result.
    func sendBarcodeScan(_ gtin: String) {
        ws.send(.barcodeScan(gtin: gtin))
    }

    /// Confirm scale reading for an item.
    func sendScaleConfirm(itemId: String, quantity: Double, unit: String) {
        ws.send(.scaleConfirm(itemId: itemId, quantity: quantity, unit: unit))
    }

    // MARK: - Inline Editing

    /// Begin inline editing for a card — pauses voice capture so Gemini
    /// doesn't interfere while the user is typing.
    func openInlineEdit(itemId: String) {
        if !isPaused {
            capture.stop()
        }
        // Mute audio playback to prevent Gemini audio from triggering view re-renders
        // that can disrupt TextField focus in the inline editor
        playback.muted = true
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            editingItemId = itemId
        }
    }

    /// Close inline editing (auto-commits in card's onChange).
    /// Resumes voice capture if session is still active.
    func closeInlineEdit() {
        playback.muted = false
        editingQuantity = nil
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            editingItemId = nil
        }
        if !isPaused, case .active = sessionState {
            do { try capture.start() } catch {}
        }
    }

    // MARK: - Touch Actions

    /// User edited quantity via touch UI.
    func touchEditItem(itemId: String, quantity: Double, unit: String) {
        ws.send(.touchEditItem(itemId: itemId, quantity: quantity, unit: unit))
    }

    /// User swiped to delete an item via touch UI.
    func touchRemoveItem(itemId: String) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        ws.send(.touchRemoveItem(itemId: itemId))
    }

    /// User completed food creation via manual form.
    func touchCompleteCreation(itemId: String, name: String, calories: Double,
                                proteinG: Double, carbsG: Double, fatG: Double,
                                servingSize: Double, servingUnit: String) {
        ws.send(.touchCompleteCreation(itemId: itemId, name: name, calories: calories,
                                       proteinG: proteinG, carbsG: carbsG, fatG: fatG,
                                       servingSize: servingSize, servingUnit: servingUnit))
    }

    // MARK: - Pause / Resume

    func togglePause() {
        guard case .active = sessionState else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if isPaused {
            isPaused = false
            do { try capture.start() } catch { /* already started or error */ }
        } else {
            isPaused = true
            capture.stop()
        }
    }

    // MARK: - Text Display Mode

    func toggleCaptions() {
        if textDisplayMode == .editing {
            exitEditMode()
            return
        }
        textDisplayMode = textDisplayMode == .off ? .captions : .off
    }

    func enterEditMode() {
        capture.stop()
        isPaused = true
        editText = captionText
        textDisplayMode = .editing
    }

    func exitEditMode() {
        editText = ""
        textDisplayMode = .captions
        isPaused = false
        do { try capture.start() } catch {}
    }

    func submitEdit() {
        let trimmed = editText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sessionEnded else { return }
        editText = ""
        textDisplayMode = .captions
        isPaused = false
        ws.send(.transcript(text: trimmed))
        do { try capture.start() } catch {}
    }

    // MARK: - Camera / Barcode Mode

    /// Toggle barcode camera mode. Requests camera permission on first activation.
    /// Does NOT pause audio capture — barcode mode is non-interrupting (matches RN).
    func toggleBarcodeMode() {
        guard case .active = sessionState else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        if barcodeModeActive {
            // Deactivate
            barcodeModeActive = false
            camera.stop()
        } else {
            // Activate — request permission if needed
            Task {
                if !cameraPermissionGranted {
                    cameraPermissionGranted = await camera.requestPermission()
                }
                guard cameraPermissionGranted else { return }

                camera.onBarcodeDetected = { [weak self] gtin in
                    self?.handleBarcodeDetected(gtin)
                }
                camera.start()
                barcodeModeActive = true
            }
        }
    }

    func flipCamera() {
        camera.switchCamera()
    }

    func toggleFlash() {
        camera.torchEnabled.toggle()
    }

    /// Handle barcode detected by the camera.
    /// If a creating card has "barcode" as the current field, send as transcript
    /// so it flows through the CREATE_FOOD_RESPONSE pipeline (matches RN lines 597–609).
    private func handleBarcodeDetected(_ gtin: String) {
        let digits = gtin.filter(\.isNumber)
        guard !digits.isEmpty else { return }

        let isFillingBarcodeField = draft.items.contains { item in
            item.state == .creating && item.creatingProgress?.currentField == .barcode
        }

        if isFillingBarcodeField {
            ws.send(.transcript(text: digits))
        } else {
            ws.send(.barcodeScan(gtin: digits))
        }
    }

    // MARK: - Cleanup

    /// Called on view disappear — auto-save if not explicitly ended.
    func cleanupOnDisappear() {
        guard !sessionEnded else { return }
        sessionEnded = true
        stopAudio()
        camera.stop()
        ws.disconnect()
        UIApplication.shared.isIdleTimerDisabled = false
        draft.reset()
    }

    private func stopAudio() {
        capture.stop()
        playback.stopEngine()
    }

    // MARK: - Server Message Handling

    private func handleServerMessage(_ msg: WSServerMessage) {
        // Block server edits for the item currently being edited by touch.
        // Gemini may still be processing pre-edit audio and calling edit_draft_item,
        // which would overwrite the user's in-progress touch edits.
        if let editId = editingItemId {
            switch msg {
            case .itemEdited(let itemId, _) where itemId == editId:
                return
            case .itemsAdded(let incoming) where incoming.contains(where: { $0.id == editId }):
                // Filter out the editing item but let other items through
                let filtered = incoming.filter { $0.id != editId }
                if !filtered.isEmpty {
                    draft.applyServerMessage(.itemsAdded(items: filtered))
                }
                // Still process non-draft side effects below
                return
            default:
                break
            }
        }

        // Let DraftStore process all draft-related messages
        draft.applyServerMessage(msg)

        switch msg {
        case .sessionSaved:
            sessionEnded = true
            stopAudio()
            UIApplication.shared.isIdleTimerDisabled = false
            Task {
                await dailyLog.fetch(date: dateStore.selectedDate)
            }
            draft.reset()
            // View will dismiss via onChange of sessionState
            sessionState = .saving

        case .sessionCancelled:
            sessionEnded = true
            stopAudio()
            UIApplication.shared.isIdleTimerDisabled = false
            draft.reset()
            sessionState = .cancelled

        case .error(let message):
            // Don't end session on server error — just log it
            print("[KitchenMode] Server error: \(message)")

        case .promptScaleConfirm:
            // TODO: wire scale reading when BLE scale is integrated
            break

        case .openBarcodeScanner:
            barcodeModeActive.toggle()

        default:
            break
        }
    }
}
