import Foundation
import Observation

/// Manages Kitchen Mode draft state and WebSocket session data.
/// Direct port of mobile/stores/draftStore.ts.
@Observable @MainActor
final class DraftStore {
    static let shared = DraftStore()

    var items:          [DraftItem] = []
    var savedTotals:    Macros = .zero
    /// Live transcript from Gemini's model turn (cleared on session reset)
    var captionText:    String = ""
    /// Item ID that the server wants us to confirm a scale reading for.
    var pendingScaleConfirmItemId: String? = nil

    private init() {}

    // MARK: - Computed

    /// Live projected totals: savedTotals + all confirmed normal draft items.
    var projectedTotals: Macros {
        let draft = items
            .filter { $0.state == .normal && $0.quantityConfirmed }
            .reduce(Macros.zero) { acc, item in
                Macros(
                    calories: acc.calories + item.calories,
                    proteinG: acc.proteinG + item.proteinG,
                    carbsG:   acc.carbsG   + item.carbsG,
                    fatG:     acc.fatG     + item.fatG)
            }
        return Macros(
            calories: savedTotals.calories + draft.calories,
            proteinG: savedTotals.proteinG + draft.proteinG,
            carbsG:   savedTotals.carbsG   + draft.carbsG,
            fatG:     savedTotals.fatG     + draft.fatG)
    }

    // MARK: - Session Lifecycle

    func initSession(savedTotals: Macros) {
        self.items       = []
        self.savedTotals = savedTotals
        self.captionText = ""
        self.pendingScaleConfirmItemId = nil
    }

    func reset() {
        items       = []
        savedTotals = .zero
        captionText = ""
        pendingScaleConfirmItemId = nil
    }

    /// Initialize from a resumed session — converts FoodEntries back to editable DraftItems.
    func initResumedSession(items resumedItems: [DraftItem], savedTotals: Macros) {
        self.savedTotals = savedTotals
        self.captionText = ""
        self.pendingScaleConfirmItemId = nil
        self.items = resumedItems.map { item in
            var d = item
            if d.state == .normal {
                d.quantityConfirmed = true
            }
            return d
        }
    }

    // MARK: - Apply Server Message

    func applyServerMessage(_ msg: WSServerMessage) {
        switch msg {

        case .itemsAdded(let incoming):
            for var newItem in incoming {
                // Items with assumed quantity need user confirmation
                newItem.quantityConfirmed = !(newItem.isAssumed ?? false)
                // Populate base macro data for live scale scaling
                if newItem.baseMacros == nil {
                    newItem.baseServingSize = newItem.quantity
                    newItem.baseServingUnit = newItem.unit
                    newItem.baseMacros = Macros(
                        calories: newItem.calories,
                        proteinG: newItem.proteinG,
                        carbsG:   newItem.carbsG,
                        fatG:     newItem.fatG)
                }
                if let idx = items.firstIndex(where: { $0.id == newItem.id }) {
                    items[idx] = newItem
                } else {
                    items.append(newItem)
                }
            }

        case .itemEdited(let itemId, let changes):
            if let idx = items.firstIndex(where: { $0.id == itemId }) {
                var item = items[idx]
                if let v = changes.name      { item.name      = v }
                if let v = changes.quantity   { item.quantity  = v; item.isAssumed = false; item.quantityConfirmed = true }
                if let v = changes.unit       { item.unit      = v; item.isAssumed = false }
                if let v = changes.calories   { item.calories  = v }
                if let v = changes.proteinG   { item.proteinG  = v }
                if let v = changes.carbsG     { item.carbsG    = v }
                if let v = changes.fatG        { item.fatG      = v }
                if let v = changes.isAssumed  { item.isAssumed = v }
                items[idx] = item
            }

        case .itemRemoved(let itemId):
            items.removeAll { $0.id == itemId }

        case .clarify(let itemId, let question):
            updateItem(id: itemId) { $0.state = .clarifying; $0.clarifyQuestion = question }

        case .createFoodPrompt(let itemId, let foodName, _):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            items.append(makePlaceholder(id: itemId, name: foodName, state: .creating,
                                         progress: CreatingFoodProgress(currentField: .confirm)))

        case .createFoodField(let itemId, _, let field, _, let collectedValues):
            updateItem(id: itemId) { item in
                item.state = .creating
                var progress = item.creatingProgress ?? CreatingFoodProgress(currentField: .confirm)
                if let cv = collectedValues {
                    if let v = cv.servingSize  { progress.servingSize = v }
                    if let v = cv.servingUnit  { progress.servingUnit = v }
                    if let v = cv.calories     { progress.calories    = v }
                    if let v = cv.proteinG     { progress.proteinG    = v }
                    if let v = cv.carbsG       { progress.carbsG      = v }
                    if let v = cv.fatG         { progress.fatG        = v }
                    if let v = cv.brand        { progress.brand       = v }
                    if let v = cv.barcode      { progress.barcode     = v }
                }
                progress.currentField  = field
                item.creatingProgress  = progress
            }

        case .createFoodComplete(let completed):
            if let idx = items.firstIndex(where: { $0.id == completed.id }) {
                items[idx] = completed
            } else {
                // No pending creation card — append directly (Gemini called create_custom_food
                // before any report_nutrition_field calls, e.g. user spoke all values at once)
                items.append(completed)
            }

        case .createFoodConfirm(let itemId, _, let collectedValues, let initQty, let initUnit, let mismatch):
            updateItem(id: itemId) { item in
                item.state           = .confirming
                item.initialQuantity = initQty
                item.initialUnit     = initUnit
                var progress         = collectedValues
                progress.currentField = .complete
                item.creatingProgress = progress
                item.confirmingData   = DraftItem.ConfirmingData(
                    quantityMismatch: mismatch,
                    collectedValues:  collectedValues)
            }

        case .foodChoice(let itemId, let foodName, _):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            items.append(makePlaceholder(id: itemId, name: foodName, state: .choice))

        case .usdaConfirm(let itemId, let usdaDescription, _, let usdaResult):
            updateItem(id: itemId) { item in
                item.name     = usdaDescription
                item.calories = usdaResult.macros.calories
                item.proteinG = usdaResult.macros.proteinG
                item.carbsG   = usdaResult.macros.carbsG
                item.fatG     = usdaResult.macros.fatG
                item.state    = .usdaPending
            }

        case .draftReplaced(let draft, _):
            items = draft

        case .operationCancelled(let itemId, _):
            items.removeAll { $0.id == itemId }

        case .disambiguate(let itemId, let foodName, _, let options):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            var placeholder = makePlaceholder(id: itemId, name: foodName, state: .disambiguate,
                                              source: .database)
            placeholder.disambiguationOptions = options
            items.append(placeholder)

        case .confirmClear(let question):
            guard !items.contains(where: { $0.state == .confirmClear }) else { break }
            let clearId = "confirm-clear-\(Int(Date().timeIntervalSince1970 * 1000))"
            var sentinel = makePlaceholder(id: clearId, name: "Clear all items?", state: .confirmClear)
            sentinel.clarifyQuestion = question
            items.append(sentinel)

        case .communitySubmitPrompt(let itemId, _, let question):
            updateItem(id: itemId) { $0.state = .communitySubmitPrompt; $0.clarifyQuestion = question }

        case .historyResults(let itemId, let dateLabel, _, let entries, let totals, let addedToDraft):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            var item = makePlaceholder(id: itemId, name: "\(dateLabel) log",
                                       state: .historyResults, source: .database)
            item.calories    = totals.calories
            item.proteinG    = totals.proteinG
            item.carbsG      = totals.carbsG
            item.fatG        = totals.fatG
            item.historyData = DraftItem.HistoryData(
                dateLabel: dateLabel, entries: entries,
                totals: totals, addedToDraft: addedToDraft)
            items.append(item)

        case .macroSummary(let itemId, let summary):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            var item = makePlaceholder(id: itemId, name: "Macro Summary",
                                       state: .macroSummary, source: .database)
            item.calories = summary.calories
            item.proteinG = summary.proteinG
            item.carbsG   = summary.carbsG
            item.fatG     = summary.fatG
            items.append(item)

        case .foodInfo(let itemId, let foodName, let usdaResult, _):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            var item = makePlaceholder(id: itemId, name: foodName,
                                       state: .foodInfo, source: .database)
            item.quantity   = usdaResult.servingSize ?? 1
            item.unit       = usdaResult.servingSizeUnit ?? "g"
            item.calories   = usdaResult.macros.calories
            item.proteinG   = usdaResult.macros.proteinG
            item.carbsG     = usdaResult.macros.carbsG
            item.fatG       = usdaResult.macros.fatG
            item.usdaFdcId  = usdaResult.fdcId
            items.append(item)

        case .foodSuggestions(let itemId, _):
            guard !items.contains(where: { $0.id == itemId }) else { break }
            items.append(makePlaceholder(id: itemId, name: "Food Suggestions",
                                         state: .foodSuggestions, source: .database))

        case .estimateCard(let item, _):
            guard !items.contains(where: { $0.id == item.id }) else { break }
            items.append(item)

        case .promptScaleConfirm(let itemId):
            pendingScaleConfirmItemId = itemId

        case .audioData(let data, let mimeType):
            AudioPlaybackService.shared.enqueue(base64Data: data, mimeType: mimeType)

        case .serverTranscript(let text, _):
            captionText = text

        case .sessionResumed(let resumedItems):
            initResumedSession(items: resumedItems, savedTotals: savedTotals)

        // Non-draft-mutating messages — ignored here
        case .openBarcodeScanner, .ask, .error,
             .sessionSaved, .sessionCancelled, .sessionPaused:
            break
        }
    }

    // MARK: - Helpers

    private func updateItem(id: String, mutation: (inout DraftItem) -> Void) {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        mutation(&items[idx])
    }

    private func makePlaceholder(
        id: String, name: String,
        state: DraftCardState,
        source: FoodSource = .custom,
        progress: CreatingFoodProgress? = nil
    ) -> DraftItem {
        DraftItem(
            id: id, name: name, quantity: 1, unit: "servings",
            calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
            source: source,
            mealLabel: currentMealLabel(),
            state: state,
            creatingProgress: progress)
    }

    /// Provisional label — server recategorizes after save.
    private func currentMealLabel() -> MealLabel {
        return .snack
    }
}
