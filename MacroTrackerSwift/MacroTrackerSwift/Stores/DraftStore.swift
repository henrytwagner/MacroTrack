import Foundation
import Observation

/// Manages Kitchen Mode draft state and WebSocket session data.
/// Direct port of mobile/stores/draftStore.ts.
@Observable @MainActor
final class DraftStore {
    static let shared = DraftStore()

    var items:          [DraftItem] = []
    var savedTotals:    Macros = .zero

    private init() {}

    // MARK: - Computed

    /// Live projected totals: savedTotals + all normal draft items.
    var projectedTotals: Macros {
        let draft = items
            .filter { $0.state == .normal }
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
    }

    func reset() {
        items       = []
        savedTotals = .zero
    }

    // MARK: - Apply Server Message

    func applyServerMessage(_ msg: WSServerMessage) {
        switch msg {

        case .itemsAdded(let incoming):
            for newItem in incoming {
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
                if let v = changes.quantity  { item.quantity  = v; item.isAssumed = false }
                if let v = changes.unit      { item.unit      = v; item.isAssumed = false }
                if let v = changes.calories  { item.calories  = v }
                if let v = changes.proteinG  { item.proteinG  = v }
                if let v = changes.carbsG    { item.carbsG    = v }
                if let v = changes.fatG      { item.fatG      = v }
                if let v = changes.isAssumed { item.isAssumed = v }
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

        case .promptScaleConfirm:
            break // handled by WSClient → UI layer in Phase E

        // Non-draft-mutating messages — ignored here
        case .openBarcodeScanner, .ask, .error,
             .sessionSaved, .sessionCancelled:
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

    private func currentMealLabel() -> MealLabel {
        let h = Calendar.current.component(.hour, from: Date())
        switch h {
        case  5..<11: return .breakfast
        case 11..<14: return .lunch
        case 17..<22: return .dinner
        default:      return .snack
        }
    }
}
