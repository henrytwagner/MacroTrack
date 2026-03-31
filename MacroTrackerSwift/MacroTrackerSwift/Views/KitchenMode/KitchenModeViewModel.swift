import SwiftUI
@preconcurrency import AVFoundation
import AudioToolbox
import Observation

// MARK: - Session State

enum KitchenModeSessionState: Equatable {
    case idle
    case connecting
    case active
    case saving
    case paused
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

    /// True while a camera photo is being identified by the server.
    private(set) var isCameraProcessing = false

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

    /// The single card currently shown as hero. Nil = no items.
    /// Auto-set to newest non-normal item when items change.
    var expandedItemId: String? = nil

    /// Currently-editing card ID (nil = no card in edit mode).
    var editingItemId: String? = nil

    /// Whether the macro pill is expanded to show detailed progress.
    var macroPreviewExpanded = false

    /// Live-updated quantity from the inline editor (nil when not editing).
    var editingQuantity: Double? = nil

    /// Last scanned barcode GTIN — shown as a debug overlay card, auto-dismissed.
    var debugBarcode: String? = nil

    /// Last barcode GTIN that was successfully sent to the server.
    /// Used to block accidental consecutive scans of the same barcode.
    private var lastProcessedGTIN: String? = nil

    /// Duplicate-scan toast message — auto-dismissed after 3 seconds.
    var duplicateScanMessage: String? = nil

    /// Whether the food search sheet is presented.
    var showFoodSearch: Bool = false

    /// Whether the Scale Settings (auto-progression) sheet is presented.
    var showScaleSettings: Bool = false

    /// Whether the Scale Connection sheet is presented.
    var showScaleConnection: Bool = false

    /// Pre-fill name for FoodSearchView when bridging from a voice choice card (food not found).
    /// Cleared whenever the search sheet is dismissed.
    var pendingSearchName: String? = nil

    /// GTIN from a barcode scan that triggered a food_choice card.
    /// Used to pre-fill barcode field when creating a food and to open search with empty query.
    var pendingBarcodeGtin: String? = nil

    /// Whether there are unconfirmed items (blocks save).
    var hasUnconfirmedItems: Bool {
        draft.items.contains { $0.state == .normal && !$0.quantityConfirmed }
    }

    // MARK: - Feature Toggles (persisted)

    @ObservationIgnored
    @AppStorage("kitchenVoiceEnabled") var voiceEnabled: Bool = false

    @ObservationIgnored
    @AppStorage("kitchenScaleEnabled") var scaleEnabled: Bool = true

    @ObservationIgnored
    @AppStorage("kitchenCameraEnabled") var cameraEnabled: Bool = false

    // MARK: - Auto-Progression Settings (persisted via UserDefaults)
    // These use plain stored properties (not @AppStorage) so @Observable can track
    // mutations and drive SwiftUI re-renders in ScaleSettingsSheet.

    var autoProgressionEnabled: Bool = UserDefaults.standard.bool(forKey: "autoProgressionEnabled") {
        didSet { UserDefaults.standard.set(autoProgressionEnabled, forKey: "autoProgressionEnabled") }
    }

    var autoProgressionAutoZero: Bool = {
        UserDefaults.standard.object(forKey: "autoProgressionAutoZero") == nil
            ? true : UserDefaults.standard.bool(forKey: "autoProgressionAutoZero")
    }() {
        didSet { UserDefaults.standard.set(autoProgressionAutoZero, forKey: "autoProgressionAutoZero") }
    }

    var autoProgressionSound: Bool = UserDefaults.standard.bool(forKey: "autoProgressionSound") {
        didSet { UserDefaults.standard.set(autoProgressionSound, forKey: "autoProgressionSound") }
    }

    var autoProgressionVoiceChain: Bool = {
        UserDefaults.standard.object(forKey: "autoProgressionVoiceChain") == nil
            ? true : UserDefaults.standard.bool(forKey: "autoProgressionVoiceChain")
    }() {
        didSet { UserDefaults.standard.set(autoProgressionVoiceChain, forKey: "autoProgressionVoiceChain") }
    }

    var autoProgressionTimerEnabled: Bool = UserDefaults.standard.bool(forKey: "autoProgressionTimerEnabled") {
        didSet { UserDefaults.standard.set(autoProgressionTimerEnabled, forKey: "autoProgressionTimerEnabled") }
    }

    var autoProgressionTimerSeconds: Double = {
        let val = UserDefaults.standard.double(forKey: "autoProgressionTimerSeconds")
        return val > 0 ? val : 3.0
    }() {
        didSet { UserDefaults.standard.set(autoProgressionTimerSeconds, forKey: "autoProgressionTimerSeconds") }
    }

    // MARK: - Auto-Progression Runtime State

    /// The item ID currently showing a chain-confirm flash animation.
    var autoConfirmedItemId: String? = nil

    /// Timer task for stability-based auto-confirm.
    private var autoConfirmTimerTask: Task<Void, Never>? = nil

    /// The first item currently in scale weighing mode.
    var currentWeighingItemId: String? {
        draft.items.first(where: { $0.scaleWeighingActive })?.id
    }

    /// Whether audio is currently active in this session (started by voice toggle).
    private(set) var audioActive = false

    // MARK: - Dependencies (singletons)

    private let ws = WSClient.shared
    private let capture = AudioCaptureService.shared
    private let playback = AudioPlaybackService.shared
    private let camera = KitchenCameraSession.shared
    private let draft = DraftStore.shared
    private let dailyLog = DailyLogStore.shared
    private let scale = ScaleManager.shared
    private let dateStore = DateStore.shared
    private let goalStore = GoalStore.shared

    /// True once the session has ended (save/cancel/disconnect) — prevents double-close.
    private var sessionEnded = false

    /// If set before startSession(), the VM will resume an existing paused session.
    var resumeSessionId: String? = nil

    // MARK: - Computed

    /// Items reversed so newest appears at top.
    var reversedItems: [DraftItem] {
        draft.items.reversed()
    }

    /// The "active" card: first non-normal card, or topmost card.
    /// Used as fallback when expandedItemId hasn't been set yet.
    var activeId: String? {
        reversedItems.first(where: { $0.state != .normal })?.id ?? reversedItems.first?.id
    }

    /// The effective hero card ID — uses explicit expandedItemId if set, otherwise auto-computed.
    var heroId: String? {
        if let id = expandedItemId, draft.items.contains(where: { $0.id == id }) {
            return id
        }
        return activeId
    }

    /// Expand a specific card (collapses the previous one since only one hero at a time).
    func expandItem(_ id: String) {
        if expandedItemId != id {
            cancelSubtractiveMode()
            // Preserve zero offset during auto-progression (chainConfirm sets it for the next item)
            let preserveZero = autoProgressionEnabled && autoProgressionAutoZero
            if !keepZeroOffset && !preserveZero { zeroOffset = nil }
        }
        expandedItemId = id
    }

    /// Auto-focus the newest non-normal item (called when items change).
    func autoFocusNewestItem() {
        if let nonNormal = reversedItems.first(where: { $0.state != .normal }) {
            expandedItemId = nonNormal.id
        } else if let first = reversedItems.first {
            // Only auto-switch if current expanded item was removed
            if expandedItemId == nil || !draft.items.contains(where: { $0.id == expandedItemId }) {
                expandedItemId = first.id
            }
        } else {
            expandedItemId = nil
        }
    }

    var projectedTotals: Macros {
        draft.projectedTotals
    }

    /// Projected totals adjusted for live-edited quantity or live scale reading.
    var liveProjectedTotals: Macros {
        var totals = projectedTotals

        // Adjust for inline editor
        if let editId = editingItemId,
           let editQty = editingQuantity,
           let item = draft.items.first(where: { $0.id == editId }),
           item.quantity > 0 {
            let scale = editQty / item.quantity
            totals = Macros(
                calories: totals.calories + item.calories * (scale - 1),
                proteinG: totals.proteinG + item.proteinG * (scale - 1),
                carbsG:   totals.carbsG   + item.carbsG   * (scale - 1),
                fatG:     totals.fatG     + item.fatG     * (scale - 1))
        }

        // Adjust for live scale weighing
        if let reading = adjustedScaleReading, reading.stable,
           let weighingItem = draft.items.first(where: { $0.scaleWeighingActive }),
           let baseSize = weighingItem.baseServingSize, baseSize > 0,
           let baseMacros = weighingItem.baseMacros {
            let weightValue: Double
            if let delta = subtractiveDelta, subtractiveItemId == weighingItem.id {
                weightValue = delta
            } else {
                weightValue = reading.value
            }
            guard weightValue > 0 else { return totals }
            let readingInBaseUnit = convertScaleReading(
                ScaleReading(value: weightValue, unit: reading.unit,
                             display: "", stable: true, rawHex: ""),
                toUnit: weighingItem.baseServingUnit ?? "g")
            let scaleFactor = readingInBaseUnit / baseSize
            let liveMacros = Macros(
                calories: baseMacros.calories * scaleFactor,
                proteinG: baseMacros.proteinG * scaleFactor,
                carbsG:   baseMacros.carbsG   * scaleFactor,
                fatG:     baseMacros.fatG     * scaleFactor)
            // Replace the item's stored macros with live-scaled macros
            totals = Macros(
                calories: totals.calories - weighingItem.calories + liveMacros.calories,
                proteinG: totals.proteinG - weighingItem.proteinG + liveMacros.proteinG,
                carbsG:   totals.carbsG   - weighingItem.carbsG   + liveMacros.carbsG,
                fatG:     totals.fatG     - weighingItem.fatG     + liveMacros.fatG)
        }

        return totals
    }

    var captionText: String {
        draft.captionText
    }

    var items: [DraftItem] {
        draft.items
    }

    // MARK: - Scale

    var scaleState: ScaleConnectionState { scale.connectionState }
    var scaleReading: ScaleReading? { scale.latestReading }
    var isScaleConnected: Bool { scale.connectionState == .connected }

    /// Whether to show the brief "Scale connected" banner (driven by ScaleManager).
    var showScaleConnectedBanner: Bool { scale.showConnectedBanner }

    // MARK: Software Zero

    /// Software zero offset — subtracted from raw scale readings.
    var zeroOffset: Double? = nil

    /// Whether to keep the zero offset when switching between cards.
    var keepZeroOffset: Bool = false

    /// The scale reading adjusted for the software zero offset.
    var adjustedScaleReading: ScaleReading? {
        guard let reading = scaleReading else { return nil }
        guard let offset = zeroOffset else { return reading }
        let adjusted = reading.value - offset
        return ScaleReading(
            value: adjusted,
            unit: reading.unit,
            display: formatScaleDisplay(adjusted, unit: reading.unit),
            stable: reading.stable,
            rawHex: reading.rawHex
        )
    }

    /// Store current scale reading as the zero reference point.
    func zeroScale() {
        guard let reading = scaleReading else { return }
        zeroOffset = reading.value
    }

    /// Clear the zero offset.
    func clearZero() {
        zeroOffset = nil
    }

    /// Format a scale value for display (e.g., "137.4 g").
    private func formatScaleDisplay(_ value: Double, unit: ScaleUnit) -> String {
        switch unit {
        case .lbOz:
            let totalOz = value
            let lbs = Int(totalOz / 16)
            let oz = totalOz - Double(lbs) * 16
            return String(format: "%d lb %.2f oz", lbs, oz)
        default:
            if unit == .g || unit == .ml {
                return String(format: "%.1f %@", value, unit.rawValue)
            } else {
                return String(format: "%.2f %@", value, unit.rawValue)
            }
        }
    }

    // MARK: Subtractive Weighing

    /// The locked start weight for subtractive mode (in scale units).
    var subtractiveStartWeight: Double? = nil

    /// The unit of the start weight.
    var subtractiveStartUnit: ScaleUnit? = nil

    /// The item ID currently in subtractive mode.
    var subtractiveItemId: String? = nil

    /// Whether an item is currently in subtractive weighing mode.
    func isInSubtractiveMode(_ itemId: String) -> Bool {
        subtractiveItemId == itemId && subtractiveStartWeight != nil
    }

    /// The live delta (start - current) for subtractive mode.
    var subtractiveDelta: Double? {
        guard let start = subtractiveStartWeight,
              let reading = adjustedScaleReading else { return nil }
        let delta = start - reading.value
        return max(delta, 0)
    }

    /// Enter subtractive weighing mode: lock current adjusted reading as start weight.
    func startSubtractiveMode(for itemId: String) {
        guard let reading = adjustedScaleReading else { return }
        subtractiveStartWeight = reading.value
        subtractiveStartUnit = reading.unit
        subtractiveItemId = itemId
    }

    /// Exit subtractive mode without confirming.
    func cancelSubtractiveMode() {
        subtractiveStartWeight = nil
        subtractiveStartUnit = nil
        subtractiveItemId = nil
    }

    /// Confirm the subtractive delta as the item's quantity.
    func confirmSubtractiveDelta(for itemId: String) {
        guard let delta = subtractiveDelta, delta > 0,
              let unit = subtractiveStartUnit else { return }

        if let idx = draft.items.firstIndex(where: { $0.id == itemId }) {
            var item = draft.items[idx]
            if let baseSize = item.baseServingSize, baseSize > 0, let baseMacros = item.baseMacros {
                let deltaReading = ScaleReading(
                    value: delta, unit: unit,
                    display: formatScaleDisplay(delta, unit: unit),
                    stable: true, rawHex: "")
                let readingInBaseUnit = convertScaleReading(deltaReading, toUnit: item.baseServingUnit ?? "g")
                let scale = readingInBaseUnit / baseSize
                item.calories = baseMacros.calories * scale
                item.proteinG = baseMacros.proteinG * scale
                item.carbsG   = baseMacros.carbsG   * scale
                item.fatG     = baseMacros.fatG     * scale
            }
            item.quantity = delta
            item.unit = unit.rawValue
            item.quantityConfirmed = true
            item.scaleWeighingActive = false
            item.confirmedViaScale = true
            draft.items[idx] = item
        }

        sendScaleConfirm(itemId: itemId, quantity: delta, unit: unit.rawValue)

        // Clean up subtractive state
        subtractiveStartWeight = nil
        subtractiveStartUnit = nil
        subtractiveItemId = nil
        if !keepZeroOffset { zeroOffset = nil }
    }

    // MARK: - Auto-Progression

    /// Chain-confirm the current weighing item: confirm weight, auto-zero, fire feedback.
    /// Called when a new item arrives (barcode/voice) or stability timer fires.
    func chainConfirm(itemId: String) {
        // Guard: item must still be actively weighing
        guard let idx = draft.items.firstIndex(where: { $0.id == itemId }),
              draft.items[idx].scaleWeighingActive else { return }
        // Guard: must have a stable reading > 0
        guard let reading = adjustedScaleReading, reading.stable, reading.value > 0 else { return }
        // Guard: not in subtractive mode (that has its own explicit flow)
        guard subtractiveItemId != itemId else { return }
        // Guard: item must be in normal state (not creating/clarifying/etc.)
        guard draft.items[idx].state == .normal else { return }

        // Capture raw reading BEFORE confirm clears the zero offset
        let rawValue = scaleReading?.value

        // Temporarily prevent confirmScaleReading from clearing zero
        let savedKeepZero = keepZeroOffset
        keepZeroOffset = true
        confirmScaleReading(for: itemId)
        keepZeroOffset = savedKeepZero

        // Auto-zero at the raw reading so next item measures from 0
        if autoProgressionAutoZero, let raw = rawValue {
            zeroOffset = raw
        } else if !savedKeepZero {
            zeroOffset = nil
        }

        // Visual feedback: mark item for flash animation
        withAnimation(.easeOut(duration: 0.3)) {
            autoConfirmedItemId = itemId
        }

        // Haptic
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        // Sound
        if autoProgressionSound {
            AudioServicesPlaySystemSound(1057) // subtle tick sound
        }

        // Cancel any running stability timer
        autoConfirmTimerTask?.cancel()
        autoConfirmTimerTask = nil

        // Clear flash after 2 seconds
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            if self.autoConfirmedItemId == itemId {
                withAnimation(.easeOut(duration: 0.3)) {
                    self.autoConfirmedItemId = nil
                }
            }
        }
    }

    /// Try to chain-confirm the current weighing item if auto-progression is enabled.
    /// Returns true if a chain-confirm was performed.
    @discardableResult
    func tryChainConfirm() -> Bool {
        guard autoProgressionEnabled, isScaleConnected else { return false }
        guard let weighingId = currentWeighingItemId else { return false }
        guard let reading = adjustedScaleReading, reading.stable, reading.value > 0 else { return false }
        chainConfirm(itemId: weighingId)
        return true
    }

    /// Restart the stability-based auto-confirm timer when scale reading updates.
    /// Called from the view's .onChange of scale reading.
    func updateAutoConfirmTimer() {
        guard autoProgressionEnabled, autoProgressionTimerEnabled else {
            autoConfirmTimerTask?.cancel()
            autoConfirmTimerTask = nil
            return
        }
        guard let weighingId = currentWeighingItemId else {
            autoConfirmTimerTask?.cancel()
            autoConfirmTimerTask = nil
            return
        }
        guard let reading = adjustedScaleReading, reading.stable, reading.value > 0 else {
            // Reading unstable or gone — cancel timer
            autoConfirmTimerTask?.cancel()
            autoConfirmTimerTask = nil
            return
        }

        // If timer already running for this item, let it continue
        if autoConfirmTimerTask != nil { return }

        // Start countdown
        let duration = autoProgressionTimerSeconds
        autoConfirmTimerTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(duration))
            guard !Task.isCancelled else { return }
            // Re-check conditions before confirming
            guard self.autoProgressionEnabled,
                  self.autoProgressionTimerEnabled,
                  self.currentWeighingItemId == weighingId,
                  let r = self.adjustedScaleReading, r.stable, r.value > 0 else { return }
            self.chainConfirm(itemId: weighingId)
            self.autoConfirmTimerTask = nil
        }
    }

    /// Whether a food item has any weight-compatible unit available.
    func itemHasWeightUnit(_ item: DraftItem) -> Bool {
        if measurementSystem(for: item.unit) == .weight { return true }
        if let base = item.baseServingUnit, measurementSystem(for: base) == .weight { return true }
        return item.conversions.contains { $0.measurementSystem == .weight }
    }

    /// The last scale reading before disconnect — used to pre-fill manual editor.
    private var lastScaleReading: ScaleReading? = nil

    /// React to scale connection state changes.
    /// When scale disconnects while items are in weighing mode, fall back to manual entry
    /// with the last reading pre-filled.
    func handleScaleStateChange(_ newState: ScaleConnectionState) {
        switch newState {
        case .idle, .error:
            cancelSubtractiveMode()
            let lastReading = lastScaleReading
            for idx in draft.items.indices where draft.items[idx].scaleWeighingActive {
                // Pre-fill quantity with the last scale reading so the editor shows it
                if let reading = lastReading {
                    let adjusted = zeroOffset.map { reading.value - $0 } ?? reading.value
                    if adjusted > 0 {
                        draft.items[idx].quantity = adjusted
                        draft.items[idx].unit = reading.unit.rawValue
                    }
                }
                draft.items[idx].scaleWeighingActive = false
                let itemId = draft.items[idx].id
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(100))
                    self.openInlineEdit(itemId: itemId)
                }
            }
            if !keepZeroOffset { zeroOffset = nil }
            lastScaleReading = nil
        default:
            break
        }
    }

    /// Track the last valid scale reading so we can use it on disconnect.
    func updateLastScaleReading() {
        if let reading = scaleReading {
            lastScaleReading = reading
        }
    }

    /// Whether to show the separate KitchenScaleCard (hide once readings are flowing to draft cards).
    var shouldShowScaleCard: Bool {
        if scale.showConnectedBanner || scale.showErrorBanner { return true }
        switch scale.connectionState {
        case .idle: return false
        case .scanning, .connecting: return true
        case .connected: return scale.latestReading == nil
        case .error: return true
        }
    }

    func connectScale() { scale.connect() }
    func disconnectScale() { scale.disconnect() }
    func cancelScaleScan() { scale.cancelScan() }

    /// Long-press on scale icon: connection sheet when disconnected, settings when connected.
    func scaleIconLongPressed() {
        switch scale.connectionState {
        case .connected:
            showScaleSettings = true
        case .idle, .error, .scanning, .connecting:
            showScaleConnection = true
        }
    }

    /// Toggle scale connection from the bottom bar — persists preference.
    func toggleScale() {
        switch scale.connectionState {
        case .idle, .error:
            scale.connect()
            scaleEnabled = true
        case .scanning, .connecting:
            scale.cancelScan()
            scaleEnabled = false
        case .connected:
            scale.disconnect()
            scaleEnabled = false
        }
    }

    func simulateScale() {
        #if DEBUG
        scale.simulate()
        #endif
    }

    /// User tapped the scale chip on a draft card — apply current reading.
    func confirmScaleReading(for itemId: String) {
        guard let reading = adjustedScaleReading, reading.stable, reading.value > 0 else { return }
        if let idx = draft.items.firstIndex(where: { $0.id == itemId }) {
            var item = draft.items[idx]
            // Scale macros from base serving
            if let baseSize = item.baseServingSize, baseSize > 0, let baseMacros = item.baseMacros {
                let readingInBaseUnit = convertScaleReading(reading, toUnit: item.baseServingUnit ?? "g")
                let scale = readingInBaseUnit / baseSize
                item.calories = baseMacros.calories * scale
                item.proteinG = baseMacros.proteinG * scale
                item.carbsG   = baseMacros.carbsG   * scale
                item.fatG     = baseMacros.fatG     * scale
            }
            item.quantity = reading.value
            item.unit = reading.unit.rawValue
            item.quantityConfirmed = true
            item.scaleWeighingActive = false
            item.confirmedViaScale = true
            draft.items[idx] = item
        }
        sendScaleConfirm(itemId: itemId, quantity: reading.value, unit: reading.unit.rawValue)
        if !keepZeroOffset { zeroOffset = nil }
    }

    /// Convert a scale reading value to the target unit system.
    private func convertScaleReading(_ reading: ScaleReading, toUnit: String) -> Double {
        let fromUnit = reading.unit.rawValue
        guard fromUnit != toUnit else { return reading.value }
        if let fromG = weightRatiosG[fromUnit], let toG = weightRatiosG[toUnit] {
            return reading.value * fromG / toG
        }
        return reading.value
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

    /// Start the Kitchen Mode session: fetch data, connect WS, optionally start audio.
    func startSession() async {
        guard case .idle = sessionState else { return }
        sessionState = .connecting

        // Load today's entries and goals for projected totals
        await dailyLog.fetch(date: dateStore.selectedDate)
        await goalStore.fetch(date: dateStore.selectedDate)

        // Initialize draft with current saved totals
        draft.initSession(savedTotals: dailyLog.totals)

        // Wire WS message handler
        ws.onMessage = { [weak self] msg in
            self?.handleServerMessage(msg)
        }
        ws.onDisconnect = { [weak self] _ in
            guard let self, !self.sessionEnded else { return }
            self.sessionState = .error("Connection lost. Your items have been saved.")
            self.stopAudio()
        }

        // Connect WebSocket (always — needed for session management and touch actions)
        ws.connect(date: dateStore.selectedDate, sessionId: resumeSessionId)

        // Start voice if enabled
        if voiceEnabled {
            let started = await startAudio()
            if !started { return }
        }

        // Auto-connect scale if enabled
        if scaleEnabled {
            scale.autoConnectIfNeeded()
        }

        // Keep screen awake
        UIApplication.shared.isIdleTimerDisabled = true

        sessionState = .active

        // Auto-activate barcode mode if last enabled
        if cameraEnabled {
            toggleBarcodeMode()
        }
    }

    /// Start audio capture + playback. Returns false on failure (sets error state).
    private func startAudio() async -> Bool {
        let micGranted = await capture.requestPermission()
        guard micGranted else {
            sessionState = .error("Microphone access required for voice mode.")
            return false
        }

        do {
            try playback.startEngine()
        } catch {
            sessionState = .error("Audio playback failed: \(error.localizedDescription)")
            return false
        }

        do {
            try capture.start()
        } catch {
            sessionState = .error("Microphone start failed: \(error.localizedDescription)")
            return false
        }

        audioActive = true
        return true
    }

    /// Toggle voice on/off mid-session.
    func toggleVoice() {
        if audioActive {
            // Disable voice
            stopAudio()
            audioActive = false
            voiceEnabled = false
            isPaused = false
            textDisplayMode = .off
        } else {
            // Enable voice
            voiceEnabled = true
            Task {
                let started = await startAudio()
                if !started {
                    voiceEnabled = false
                }
            }
        }
    }

    /// Save the session — local items via REST, server items via WS.
    func save() {
        guard !sessionEnded else { return }

        // Auto-progression: confirm the last weighing item before saving
        if autoProgressionEnabled { tryChainConfirm() }

        sessionEnded = true   // prevent cleanupOnDisappear from disconnecting early
        capture.stop()
        camera.stop()
        barcodeModeActive = false

        let localItems = draft.items.filter { $0.isLocalItem && $0.state == .normal && $0.quantityConfirmed }
        let hasServerItems = draft.items.contains { !$0.isLocalItem && $0.state == .normal }

        Task {
            // Save local (touch-added) items via REST
            for item in localItems {
                let req = CreateFoodEntryRequest(
                    date: dateStore.selectedDate,
                    name: item.name,
                    calories: item.calories,
                    proteinG: item.proteinG,
                    carbsG: item.carbsG,
                    fatG: item.fatG,
                    quantity: item.quantity,
                    unit: item.unit,
                    source: item.source,
                    mealLabel: item.mealLabel,
                    confirmedViaScale: item.confirmedViaScale ? true : nil,
                    usdaFdcId: item.usdaFdcId,
                    customFoodId: item.customFoodId,
                    communityFoodId: item.communityFoodId
                )
                _ = try? await dailyLog.createEntry(req)
            }

            // Save server items via WS (if any)
            if hasServerItems {
                ws.send(.save)
                // sessionState set to .saving after session_saved arrives
            } else {
                // No server items — dismiss directly
                await dailyLog.fetch(date: dateStore.selectedDate)
                stopAudio()
                ws.disconnect()
                scale.disconnect()
                draft.reset()
                sessionState = .saving
            }
        }
    }

    /// Pause the session — saves confirmed items, preserves drafts, dismisses.
    func pause() {
        guard !sessionEnded else { return }

        // Auto-progression: confirm the last weighing item before pausing
        if autoProgressionEnabled { tryChainConfirm() }

        sessionEnded = true
        capture.stop()
        camera.stop()
        barcodeModeActive = false

        // Send local items with the pause message so server saves them with voiceSessionId
        let localItems = draft.items.filter { $0.isLocalItem }
        ws.send(.pause(localItems: localItems))

        // Fallback: if session_paused never arrives, clean up after 2s
        Task {
            try? await Task.sleep(for: .milliseconds(2000))
            if sessionState != .paused {
                stopAudio()
                ws.disconnect()
                UIApplication.shared.isIdleTimerDisabled = false
                draft.reset()
                sessionState = .paused
            }
        }
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
        if audioActive, !isPaused, case .active = sessionState {
            do { try capture.start() } catch {}
        }
    }

    // MARK: - Touch Actions

    /// User edited quantity via touch UI — recompute macros client-side.
    func touchEditItem(itemId: String, quantity: Double, unit: String) {
        if let idx = draft.items.firstIndex(where: { $0.id == itemId }) {
            // Don't override scale state if reweighItem already activated it
            guard !draft.items[idx].scaleWeighingActive else { return }
            var item = draft.items[idx]
            item.quantityConfirmed = true
            item.scaleWeighingActive = false
            // Recompute macros from base serving data
            if let baseSize = item.baseServingSize, baseSize > 0, let baseMacros = item.baseMacros {
                let baseUnit = item.baseServingUnit ?? item.unit
                let qtyInBase = convertEditToBaseUnit(
                    quantity: quantity, unit: unit, baseUnit: baseUnit,
                    conversions: item.conversions, baseServingSize: baseSize)
                let scale = qtyInBase / baseSize
                item.calories = baseMacros.calories * scale
                item.proteinG = baseMacros.proteinG * scale
                item.carbsG   = baseMacros.carbsG   * scale
                item.fatG     = baseMacros.fatG     * scale
            }
            item.quantity = quantity
            item.unit = unit
            draft.items[idx] = item
        }
        ws.send(.touchEditItem(itemId: itemId, quantity: quantity, unit: unit))
    }

    /// Convert quantity from a given unit to the base serving unit.
    private func convertEditToBaseUnit(
        quantity: Double, unit: String, baseUnit: String,
        conversions: [FoodUnitConversion], baseServingSize: Double
    ) -> Double {
        if unit == baseUnit { return quantity }
        if unit.lowercased() == "servings" || unit.lowercased() == "serving" {
            return quantity * baseServingSize
        }
        // Check saved conversions
        if let conv = conversions.first(where: { $0.unitName == unit }), baseServingSize > 0 {
            return quantity * conv.quantityInBaseServings * baseServingSize
        }
        // Same-system ratio table conversion
        if let fromG = weightRatiosG[unit], let toG = weightRatiosG[baseUnit] {
            return quantity * fromG / toG
        }
        return quantity
    }

    /// User swiped to delete an item via touch UI.
    func touchRemoveItem(itemId: String) {
        guard let idx = draft.items.firstIndex(where: { $0.id == itemId }) else { return }
        let item = draft.items[idx]
        // Removal is intentional — clear barcode dedup so the user can re-scan.
        lastProcessedGTIN = nil
        // Local items and choice cards don't exist in session.items on the server —
        // remove from draft immediately and just notify server to clear pending state.
        if item.isLocalItem || item.state == .choice {
            draft.items.remove(at: idx)
            if item.state == .choice {
                ws.send(.touchDismissChoice(itemId: itemId))
                pendingBarcodeGtin = nil
            }
            return
        }
        ws.send(.touchRemoveItem(itemId: itemId))
    }

    /// Add a food item via touch (from FoodSearchView). Creates a local draft item.
    func addLocalDraftItem(from ingredient: SavedMealItem) {
        let item = DraftItem(
            id: UUID().uuidString,
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            calories: ingredient.calories,
            proteinG: ingredient.proteinG,
            carbsG: ingredient.carbsG,
            fatG: ingredient.fatG,
            source: ingredient.source,
            usdaFdcId: ingredient.usdaFdcId,
            customFoodId: ingredient.customFoodId,
            communityFoodId: ingredient.communityFoodId,
            mealLabel: .snack,
            state: .normal,
            quantityConfirmed: true,
            isLocalItem: true
        )
        draft.items.append(item)
    }

    /// Add a food item directly (skipping quantity selection). Creates an unconfirmed local draft item.
    func addLocalDraftItemDirect(food: AnyFood) {
        let unitIsWeight = measurementSystem(for: food.baseServingUnit) == .weight
        let itemId = UUID().uuidString
        var item = DraftItem(
            id: itemId,
            name: food.displayName,
            quantity: food.baseServingSize,
            unit: food.baseServingUnit,
            calories: food.baseMacros.calories,
            proteinG: food.baseMacros.proteinG,
            carbsG: food.baseMacros.carbsG,
            fatG: food.baseMacros.fatG,
            source: food.foodSource,
            usdaFdcId: food.asUSDA?.fdcId,
            customFoodId: food.asCustomFood?.id,
            communityFoodId: food.asCommunityFood?.id,
            mealLabel: .snack,
            state: .normal,
            quantityConfirmed: false,
            isLocalItem: true
        )
        item.baseServingSize = food.baseServingSize
        item.baseServingUnit = food.baseServingUnit
        item.baseMacros = food.baseMacros
        item.scaleWeighingActive = unitIsWeight && isScaleConnected
        draft.items.append(item)
        expandedItemId = item.id

        // Fetch unit conversions asynchronously
        Task {
            let conversions = await fetchConversions(for: food)
            if let idx = draft.items.firstIndex(where: { $0.id == itemId }) {
                draft.items[idx].conversions = conversions
            }
        }

        // Always open inline quantity editor for manually-selected items,
        // unless the scale is connected and the food uses a weight unit (scale weighing takes over)
        if !item.scaleWeighingActive {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(200))
                openInlineEdit(itemId: itemId)
            }
        }
    }

    /// User tapped "Create new food" on a choice card. Removes the card and opens an inline
    /// creation form — no Gemini transcript needed.
    func choiceCreateFood(itemId: String, name: String) {
        if let idx = draft.items.firstIndex(where: { $0.id == itemId }) {
            draft.items.remove(at: idx)
        }
        ws.send(.touchRemoveItem(itemId: itemId))
        if let barcode = pendingBarcodeGtin {
            createLocalDraftItem(name: "", barcode: barcode)
            pendingBarcodeGtin = nil
        } else {
            createLocalDraftItem(name: name)
        }
    }

    /// User tapped a USDA disambiguation option directly (touch path, no Gemini transcript needed).
    /// Removes the disambiguation card and adds the selected food as a local draft item.
    func selectDisambiguateOption(itemId: String, option: DisambiguationOption) {
        // Remove the disambiguate card
        if let idx = draft.items.firstIndex(where: { $0.id == itemId }), draft.items[idx].isLocalItem {
            draft.items.remove(at: idx)
        } else {
            ws.send(.touchRemoveItem(itemId: itemId))
        }
        let usda = option.usdaResult
        let servingSize = usda.servingSize ?? 100.0
        let servingUnit = usda.servingSizeUnit ?? "g"
        let unitIsWeight = measurementSystem(for: servingUnit) == .weight
        let newId = UUID().uuidString
        var item = DraftItem(
            id: newId,
            name: usda.description,
            quantity: servingSize,
            unit: servingUnit,
            calories: usda.macros.calories,
            proteinG: usda.macros.proteinG,
            carbsG: usda.macros.carbsG,
            fatG: usda.macros.fatG,
            source: .database,
            usdaFdcId: usda.fdcId,
            mealLabel: .snack,
            state: .normal,
            quantityConfirmed: false,
            isLocalItem: true
        )
        item.baseServingSize = servingSize
        item.baseServingUnit = servingUnit
        item.baseMacros = usda.macros
        item.scaleWeighingActive = unitIsWeight && isScaleConnected
        draft.items.append(item)
        expandedItemId = item.id
        Task {
            let conversions = try? await APIClient.shared.getFoodUnitConversionsForUsdaFood(usda.fdcId)
            if let idx = draft.items.firstIndex(where: { $0.id == newId }) {
                draft.items[idx].conversions = conversions ?? []
            }
        }
        if !voiceEnabled && !item.scaleWeighingActive {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(200))
                openInlineEdit(itemId: newId)
            }
        }
    }

    /// Create a new local draft item in `.creating` state with the given name pre-filled.
    /// Used by the touch path when a user taps "Create [name]" after searching and finding
    /// no results — bypasses CreateFoodSheet, using the inline inlineNutritionForm instead.
    /// Pass `barcode` to pre-fill the barcode field (e.g., from a barcode scan).
    func createLocalDraftItem(name: String, barcode: String? = nil) {
        let itemId = UUID().uuidString
        var item = DraftItem(
            id: itemId,
            name: name,
            quantity: 1,
            unit: "serving",
            calories: 0,
            proteinG: 0,
            carbsG: 0,
            fatG: 0,
            source: .custom,
            mealLabel: .snack,
            state: .creating,
            quantityConfirmed: false,
            isLocalItem: true
        )
        item.creatingProgress = CreatingFoodProgress(
            servingSize: nil,
            servingUnit: "g",
            calories: nil,
            proteinG: nil,
            carbsG: nil,
            fatG: nil,
            brand: nil,
            barcode: barcode,
            currentField: .servingSize
        )
        draft.items.append(item)
        expandedItemId = item.id
    }

    /// Fetch FoodUnitConversions for a food from the server.
    private func fetchConversions(for food: AnyFood) async -> [FoodUnitConversion] {
        do {
            switch food {
            case .custom(let f):
                return try await APIClient.shared.getFoodUnitConversionsForCustomFood(f.id)
            case .usda(let f):
                return try await APIClient.shared.getFoodUnitConversionsForUsdaFood(f.fdcId)
            case .community:
                return []
            }
        } catch {
            return []
        }
    }

    /// Fetch conversions for a server-originated draft item.
    private func fetchConversionsForServerItem(
        source: FoodSource, customFoodId: String?, usdaFdcId: Int?
    ) async -> [FoodUnitConversion] {
        do {
            if source == .custom, let id = customFoodId {
                return try await APIClient.shared.getFoodUnitConversionsForCustomFood(id)
            } else if source == .database, let fdcId = usdaFdcId {
                return try await APIClient.shared.getFoodUnitConversionsForUsdaFood(fdcId)
            }
            return []
        } catch {
            return []
        }
    }

    /// Re-enter live weighing mode for a confirmed item.
    /// Also dismisses the inline editor if open (without committing the edit).
    func reweighItem(itemId: String) {
        guard let idx = draft.items.firstIndex(where: { $0.id == itemId }) else { return }
        cancelSubtractiveMode()
        if !keepZeroOffset { zeroOffset = nil }
        // Set scale state BEFORE closing editor so the onChange commit
        // sees scaleWeighingActive=true and the card routes to scale UI.
        draft.items[idx].quantityConfirmed = false
        draft.items[idx].scaleWeighingActive = true
        expandedItemId = itemId
        // Dismiss inline editor if it was open for this item
        if editingItemId == itemId {
            closeInlineEdit()
        }
    }

    /// User completed food creation via manual form.
    func touchCompleteCreation(itemId: String, name: String, calories: Double,
                                proteinG: Double, carbsG: Double, fatG: Double,
                                servingSize: Double, servingUnit: String) {
        // Local items were never sent to the server — complete them client-side.
        if let idx = draft.items.firstIndex(where: { $0.id == itemId }),
           draft.items[idx].isLocalItem {
            draft.items[idx].name = name
            draft.items[idx].quantity = servingSize
            draft.items[idx].unit = servingUnit
            draft.items[idx].calories = calories
            draft.items[idx].proteinG = proteinG
            draft.items[idx].carbsG = carbsG
            draft.items[idx].fatG = fatG
            draft.items[idx].state = .normal
            draft.items[idx].creatingProgress = nil
            draft.items[idx].quantityConfirmed = false
            draft.items[idx].baseServingSize = servingSize
            draft.items[idx].baseServingUnit = servingUnit
            draft.items[idx].baseMacros = Macros(
                calories: calories, proteinG: proteinG, carbsG: carbsG, fatG: fatG)
            let unitIsWeight = measurementSystem(for: servingUnit) == .weight
            draft.items[idx].scaleWeighingActive = unitIsWeight && isScaleConnected
            return
        }
        ws.send(.touchCompleteCreation(itemId: itemId, name: name, calories: calories,
                                       proteinG: proteinG, carbsG: carbsG, fatG: fatG,
                                       servingSize: servingSize, servingUnit: servingUnit))
    }

    // MARK: - Pause / Resume

    func togglePause() {
        guard case .active = sessionState else { return }

        if isPaused {
            isPaused = false
            if audioActive {
                do { try capture.start() } catch { /* already started or error */ }
            }
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
        if audioActive {
            do { try capture.start() } catch {}
        }
    }

    func submitEdit() {
        let trimmed = editText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sessionEnded else { return }
        editText = ""
        textDisplayMode = .captions
        isPaused = false
        ws.send(.transcript(text: trimmed))
        if audioActive {
            do { try capture.start() } catch {}
        }
    }

    // MARK: - Camera / Barcode Mode

    /// Toggle barcode camera mode. Requests camera permission on first activation.
    /// Does NOT pause audio capture — barcode mode is non-interrupting (matches RN).
    func toggleBarcodeMode() {
        guard case .active = sessionState else { return }


        if barcodeModeActive {
            // Deactivate
            barcodeModeActive = false
            cameraEnabled = false
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
                cameraEnabled = true
            }
        }
    }

    func flipCamera() {
        camera.switchCamera()
    }

    func toggleFlash() {
        camera.torchEnabled.toggle()
    }

    /// Capture a photo and send it to the server for food recognition.
    /// Server forwards the image to Gemini Live, which identifies foods and
    /// adds them to the draft via the existing lookup_food / add_to_draft pipeline.
    func captureAndIdentifyFood() {
        guard !isCameraProcessing else { return }
        isCameraProcessing = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        Task {
            guard let image = await camera.capturePhoto() else {
                isCameraProcessing = false
                return
            }
            // Resize to max 1024px and compress
            let resized = image.resizedForUpload(maxDimension: 1024)
            guard let jpeg = resized.jpegData(compressionQuality: 0.6) else {
                isCameraProcessing = false
                return
            }
            let base64 = jpeg.base64EncodedString()
            ws.send(.cameraCapture(imageBase64: base64, depthContext: nil, voiceEnabled: audioActive))
        }
    }

    /// Handle barcode detected by the camera.
    /// If a creating card has "barcode" as the current field, send as transcript
    /// so it flows through the CREATE_FOOD_RESPONSE pipeline (matches RN lines 597–609).
    private func handleBarcodeDetected(_ gtin: String) {
        let digits = gtin.filter(\.isNumber)
        guard !digits.isEmpty else { return }

        // Block consecutive scans of the same barcode to prevent accidental misinput.
        if digits == lastProcessedGTIN {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                duplicateScanMessage = "Already scanned"
            }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(3))
                if self.duplicateScanMessage != nil {
                    withAnimation { self.duplicateScanMessage = nil }
                }
            }
            return
        }

        // Auto-progression: chain-confirm current weighing item before processing new barcode.
        // This runs first so the zero is set before the new item arrives.
        tryChainConfirm()

        // Debug: show scanned barcode briefly
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            debugBarcode = digits
        }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(4))
            if self.debugBarcode == digits {
                withAnimation { self.debugBarcode = nil }
            }
        }

        let isFillingBarcodeField = draft.items.contains { item in
            item.state == .creating && item.creatingProgress?.currentField == .barcode
        }

        if isFillingBarcodeField {
            ws.send(.transcript(text: digits))
        } else {
            pendingBarcodeGtin = digits
            ws.send(.barcodeScan(gtin: digits))
        }

        lastProcessedGTIN = digits
    }

    // MARK: - Cleanup

    /// Called on view disappear — auto-save if not explicitly ended.
    func cleanupOnDisappear() {
        guard !sessionEnded else { return }
        sessionEnded = true
        stopAudio()
        camera.stop()
        ws.disconnect()
        scale.disconnect()
        UIApplication.shared.isIdleTimerDisabled = false
        draft.reset()
        lastProcessedGTIN = nil
    }

    private func stopAudio() {
        capture.stop()
        playback.stopEngine()
    }

    // MARK: - App Lifecycle

    /// Handle background/foreground transitions to keep the connection healthy.
    func handleScenePhaseChange(_ phase: ScenePhase) {
        guard !sessionEnded else { return }
        switch phase {
        case .background:
            // Pause audio to release the audio session — iOS will suspend it anyway
            if audioActive {
                stopAudio()
            }
        case .active:
            // Reconnect WS if it dropped while backgrounded
            if case .active = sessionState, !ws.isConnected {
                ws.connect(date: dateStore.selectedDate)
            }
            // Restart audio if it was active before backgrounding
            if voiceEnabled && !audioActive && sessionState == .active {
                Task {
                    _ = await startAudio()
                }
            }
        default:
            break
        }
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

        // Clear camera processing indicator when items arrive
        if case .itemsAdded = msg { isCameraProcessing = false }

        // Auto-progression: voice chain-confirm when new items arrive via voice/server
        if case .itemsAdded = msg,
           autoProgressionEnabled, autoProgressionVoiceChain {
            tryChainConfirm()
        }

        // For newly added items, populate base macro data and activate scale weighing if applicable
        if case .itemsAdded(let incoming) = msg {
            for item in incoming {
                if let idx = draft.items.firstIndex(where: { $0.id == item.id }) {
                    // Populate base macro data for live scaling
                    if draft.items[idx].baseMacros == nil {
                        draft.items[idx].baseServingSize = draft.items[idx].quantity
                        draft.items[idx].baseServingUnit = draft.items[idx].unit
                        draft.items[idx].baseMacros = Macros(
                            calories: draft.items[idx].calories,
                            proteinG: draft.items[idx].proteinG,
                            carbsG:   draft.items[idx].carbsG,
                            fatG:     draft.items[idx].fatG)
                    }
                    // Activate scale weighing for unconfirmed weight-unit items
                    if !draft.items[idx].quantityConfirmed,
                       isScaleConnected,
                       measurementSystem(for: draft.items[idx].unit) == .weight {
                        draft.items[idx].scaleWeighingActive = true
                    }

                    // Fetch conversions for server-originated items
                    let itemId = draft.items[idx].id
                    let customFoodId = draft.items[idx].customFoodId
                    let usdaFdcId = draft.items[idx].usdaFdcId
                    let source = draft.items[idx].source
                    Task {
                        let convs = await fetchConversionsForServerItem(
                            source: source, customFoodId: customFoodId, usdaFdcId: usdaFdcId)
                        if let i = draft.items.firstIndex(where: { $0.id == itemId }) {
                            draft.items[i].conversions = convs
                        }
                    }
                }
            }
        }

        // Auto-focus on item changes
        switch msg {
        case .itemsAdded(let incoming):
            // Always focus the newest added item (matches addLocalDraftItemDirect behavior)
            if let lastAdded = incoming.last {
                expandItem(lastAdded.id)
            }
        case .itemRemoved:
            lastProcessedGTIN = nil
            autoFocusNewestItem()
        case .clarify, .createFoodPrompt, .disambiguate, .foodChoice:
            autoFocusNewestItem()
        default:
            break
        }

        switch msg {
        case .sessionSaved:
            sessionEnded = true
            stopAudio()
            ws.disconnect()
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
            ws.disconnect()
            UIApplication.shared.isIdleTimerDisabled = false
            draft.reset()
            sessionState = .cancelled

        case .sessionPaused:
            sessionEnded = true
            stopAudio()
            ws.disconnect()
            UIApplication.shared.isIdleTimerDisabled = false
            Task {
                await dailyLog.fetch(date: dateStore.selectedDate)
                await SessionStore.shared.fetch(date: dateStore.selectedDate)
            }
            draft.reset()
            sessionState = .paused

        case .error(let message):
            // Don't end session on server error — just log it
            print("[KitchenMode] Server error: \(message)")

        case .promptScaleConfirm(let itemId):
            // Server asks us to confirm scale weight for this item.
            // If scale is connected with a stable reading, auto-confirm.
            if let reading = adjustedScaleReading, reading.stable, reading.value > 0 {
                sendScaleConfirm(itemId: itemId, quantity: reading.value, unit: reading.unit.rawValue)
            }
            // Otherwise the user can tap the scale chip on the card manually.

        case .openBarcodeScanner:
            barcodeModeActive.toggle()

        default:
            break
        }
    }
}
