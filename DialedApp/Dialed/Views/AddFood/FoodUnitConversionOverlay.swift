import SwiftUI
import UIKit

// MARK: - FoodUnitConversionOverlay

/// Full-screen ZStack overlay rendered inside FoodDetailSheet or CreateFoodSheet.
/// Manages .preview / .unitPreview / .picking / .form states via the parent's overlayPanel binding.
@MainActor
struct FoodUnitConversionOverlay: View {
    @Binding var overlayPanel: FoodUnitConversionPanel

    // For saved-mode (FoodDetailSheet)
    var conversions: [FoodUnitConversion]
    var onAdd:    ((String, Double) async throws -> Void)?    // (unitName, qtyInBaseServings)
    var onDelete: ((String) async throws -> Void)?           // conversionId

    // For draft-mode (CreateFoodSheet)
    @Binding var pendingConversions: [PendingUnitConversion]
    var isDraftMode: Bool

    // Info needed for auto-convert
    var baseServingSize: Double
    var baseServingUnit: String

    /// Primary accent for buttons and selection (e.g. community create uses `appSuccess`).
    var accentColor: Color = Color.appTint

    /// IDs of system-level (immutable) conversions — edit/delete disabled for these.
    var systemConversionIds: Set<String> = []

    // MARK: Form state (lives here so it resets when panel closes)
    @State private var pendingToUnit:   String = ""   // locked "to" unit in the form
    @State private var formFromUnit:    String = ""   // selectable "from" unit
    @State private var formFromQty:     String = "1"
    @State private var formToQty:       String = ""
    @State private var formPickingFrom: Bool   = false
    @State private var cascadeWarning:   [ConflictItem] = []
    @State private var crossTypeWarning: (established: Double, implied: Double)? = nil
    @State private var crossTypeSuggested: Bool = false
    @State private var formError:        String? = nil
    @State private var isSaving:         Bool   = false
    @State private var customUnitText:   String = ""

    var body: some View {
        ZStack(alignment: .bottom) {
            // Scrim
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture { dismiss() }

            // Panel card
            VStack(spacing: 0) {
                // Drag handle
                RoundedRectangle(cornerRadius: BorderRadius.full)
                    .fill(Color.appSheetHandle)
                    .frame(width: 36, height: 4)
                    .padding(.top, Spacing.sm)
                    .padding(.bottom, Spacing.md)

                switch overlayPanel {
                case .idle:
                    EmptyView()
                case .preview:
                    previewContent
                case .unitPreview(let unitName):
                    unitPreviewContent(unitName: unitName)
                case .picking:
                    pickingContent
                case .form(let editingUnit):
                    formContent(editingUnit: editingUnit)
                }
            }
            .background(Color.appSurface)
            .clipShape(UnevenRoundedRectangle(
                topLeadingRadius: BorderRadius.xl,
                topTrailingRadius: BorderRadius.xl))
            .shadow(color: .black.opacity(0.2), radius: 20, x: 0, y: -4)
        }
        .ignoresSafeArea(.container)
    }

    // MARK: - Preview Panel (FoodDetailSheet: full list)

    private var previewContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Unit Conversions")
                .font(.appTitle3)
                .foregroundStyle(Color.appText)
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.md)

            if conversions.isEmpty && pendingConversions.isEmpty {
                Text("No unit conversions yet.")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.md)
            } else {
                VStack(spacing: 0) {
                    ForEach(conversions) { conv in
                        HStack {
                            Text(conv.unitName)
                                .font(.appBody)
                                .foregroundStyle(Color.appText)
                            Spacer()
                            Text("= \(Self.fmt(conv.quantityInBaseServings)) × serving")
                                .font(.appCaption1)
                                .foregroundStyle(Color.appTextSecondary)
                            if systemConversionIds.contains(conv.id) {
                                Image(systemName: "lock.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Color.appTextTertiary)
                                    .padding(.leading, Spacing.sm)
                            } else {
                                Button {
                                    Task { try? await onDelete?(conv.id) }
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.system(size: 14))
                                        .foregroundStyle(Color.appDestructive)
                                }
                                .buttonStyle(.plain)
                                .padding(.leading, Spacing.sm)
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.md)

                        Divider().padding(.leading, Spacing.lg)
                    }

                    ForEach(pendingConversions) { conv in
                        HStack {
                            Text(conv.unitName)
                                .font(.appBody)
                                .foregroundStyle(Color.appText)
                            Spacer()
                            Text("= \(Self.fmt(conv.quantityInBaseServings)) × serving")
                                .font(.appCaption1)
                                .foregroundStyle(Color.appTextSecondary)
                            Button {
                                pendingConversions.removeAll { $0.id == conv.id }
                            } label: {
                                Image(systemName: "trash")
                                    .font(.system(size: 14))
                                    .foregroundStyle(Color.appDestructive)
                            }
                            .buttonStyle(.plain)
                            .padding(.leading, Spacing.sm)
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.md)

                        Divider().padding(.leading, Spacing.lg)
                    }
                }
            }

            Button {
                overlayPanel = .picking
            } label: {
                Label("Add Unit Conversion", systemImage: "plus")
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(accentColor)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xxl)
        }
    }

    // MARK: - Unit Preview Panel (CreateFoodSheet: per-unit compact card)

    private func unitPreviewContent(unitName: String) -> some View {
        let qibs: Double = pendingConversions.first(where: { $0.unitName == unitName })?.quantityInBaseServings
                        ?? conversions.first(where: { $0.unitName == unitName })?.quantityInBaseServings
                        ?? 0
        let amountInBase = qibs * baseServingSize

        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(unitName)
                        .font(.appTitle3)
                        .foregroundStyle(Color.appText)
                    Text("1 \(unitName) = \(Self.fmt(amountInBase)) \(baseServingUnit)")
                        .font(.appBody)
                        .foregroundStyle(Color.appTextSecondary)
                }
                Spacer()
                if let conv = conversions.first(where: { $0.unitName == unitName }),
                   systemConversionIds.contains(conv.id) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appTextTertiary)
                        .frame(width: 36, height: 36)
                } else {
                    Button {
                        openEditForm(unitName: unitName)
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 16))
                            .foregroundStyle(accentColor)
                            .frame(width: 36, height: 36)
                            .background(accentColor.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xxl)
        }
    }

    // MARK: - Picking Panel

    private var pickingContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Choose a Unit")
                .font(.appTitle3)
                .foregroundStyle(Color.appText)
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.sm)

            // Custom unit text field
            HStack(spacing: Spacing.sm) {
                TextField("Custom unit (e.g. patty)", text: $customUnitText)
                    .font(.appBody)
                    .padding(Spacing.md)
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .submitLabel(.go)
                    .onSubmit { submitCustomUnit() }

                Button {
                    submitCustomUnit()
                } label: {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(customUnitValid ? accentColor : Color.appTextTertiary)
                }
                .buttonStyle(.plain)
                .disabled(!customUnitValid)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.sm)

            if let error = customUnitError {
                Text(error)
                    .font(.appCaption1)
                    .foregroundStyle(Color.appDestructive)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.sm)
            }

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(filteredAvailableUnits, id: \.self) { unit in
                        Button {
                            openForm(for: unit)
                        } label: {
                            HStack {
                                Text(unit)
                                    .font(.appBody)
                                    .foregroundStyle(Color.appText)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Color.appTextTertiary)
                            }
                            .padding(.horizontal, Spacing.lg)
                            .padding(.vertical, Spacing.md)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        Divider().padding(.leading, Spacing.lg)
                    }
                }
            }
            .frame(maxHeight: 300)
            .padding(.bottom, Spacing.xxl)
        }
    }

    // MARK: - Form Panel

    private func formContent(editingUnit: String?) -> some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            // Header
            HStack {
                Text(editingUnit == nil ? "Add Conversion" : "Edit Conversion")
                    .font(.appTitle3)
                    .foregroundStyle(Color.appText)
                Spacer()
                if editingUnit != nil {
                    Button {
                        deleteUnit(editingUnit!)
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 16))
                            .foregroundStyle(Color.appDestructive)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Spacing.lg)

            VStack(spacing: Spacing.md) {
                // [fromQty] [fromUnit] = [toQty] [pendingToUnit]
                HStack(spacing: Spacing.sm) {
                    // From qty
                    TextField("1", text: $formFromQty)
                        .font(.appBody)
                        .keyboardType(.decimalPad)
                        .padding(Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                        .frame(width: 72)

                    // From unit (dropdown if multiple options, locked label otherwise)
                    if fromUnitOptions.count > 1 {
                        Button {
                            formPickingFrom = true
                        } label: {
                            HStack(spacing: 4) {
                                Text(formFromUnit)
                                    .font(.appBody)
                                    .foregroundStyle(Color.appText)
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.system(size: 10))
                                    .foregroundStyle(Color.appTextSecondary)
                            }
                            .padding(Spacing.md)
                            .background(Color.appSurfaceSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(formFromUnit)
                            .font(.appBody)
                            .foregroundStyle(Color.appTextSecondary)
                            .padding(Spacing.md)
                            .background(Color.appSurfaceSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    }

                    Text("=")
                        .font(.appTitle3)
                        .foregroundStyle(Color.appTextSecondary)

                    // To qty
                    TextField(toQtyPlaceholder, text: $formToQty)
                        .font(.appBody)
                        .keyboardType(.decimalPad)
                        .padding(Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                        .frame(width: 72)

                    // To unit (always locked)
                    Text(pendingToUnit)
                        .font(.appBody)
                        .foregroundStyle(Color.appTextSecondary)
                        .padding(Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }

                // From-unit picker sub-panel
                if formPickingFrom {
                    VStack(spacing: 0) {
                        ForEach(fromUnitOptions, id: \.self) { unit in
                            Button {
                                formPickingFrom  = false
                                cascadeWarning   = []
                                crossTypeWarning = nil
                                crossTypeSuggested = false
                                // Recalculate toQty for the new fromUnit when a conversion path exists
                                if let fq = Double(formFromQty), fq > 0,
                                   let toQty = suggestedToQty(fromUnit: unit, fromQty: fq) {
                                    formToQty = Self.fmt(toQty)
                                } else {
                                    formToQty = ""
                                }
                                formFromUnit = unit
                            } label: {
                                HStack {
                                    Text(unit)
                                        .font(.appBody)
                                        .foregroundStyle(
                                            unit == formFromUnit ? accentColor : Color.appText)
                                    Spacer()
                                    if unit == formFromUnit {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(accentColor)
                                    }
                                }
                                .padding(.horizontal, Spacing.lg)
                                .padding(.vertical, Spacing.sm)
                            }
                            .buttonStyle(.plain)
                            Divider().padding(.leading, Spacing.lg)
                        }
                    }
                    .background(Color.appSurfaceSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }

                // Density suggestion hint
                if crossTypeSuggested {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.appTint)
                        Text("Suggested based on existing conversions.")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }
                }

                // Cascade warning box
                if !cascadeWarning.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Saving will also update:")
                            .font(.appCaption1)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.orange)
                        ForEach(cascadeWarning, id: \.unitName) { conflict in
                            let oldAmt = Self.fmt(conflict.oldQIBS * baseServingSize)
                            let newAmt = Self.fmt(conflict.newQIBS * baseServingSize)
                            Text("• \(conflict.unitName): \(oldAmt) \(baseServingUnit) → \(newAmt) \(baseServingUnit)")
                                .font(.appCaption1)
                                .foregroundStyle(Color.appTextSecondary)
                        }
                    }
                    .padding(Spacing.md)
                    .background(Color.orange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }

                // Cross-type density mismatch warning
                if let ctw = crossTypeWarning {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Density mismatch")
                            .font(.appCaption1)
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.appWarning)
                        Text("This implies \(Self.fmtDensity(ctw.implied)) g/mL, but existing conversions suggest \(Self.fmtDensity(ctw.established)) g/mL.")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                        Text("Tap \"Save anyway\" to keep this value.")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }
                    .padding(Spacing.md)
                    .background(Color.appWarning.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }

                if let err = formError {
                    Text(err)
                        .font(.appCaption1)
                        .foregroundStyle(Color.appDestructive)
                }
            }
            .padding(.horizontal, Spacing.lg)

            // Action buttons
            HStack(spacing: Spacing.sm) {
                // Cancel
                Button {
                    cancelForm(editingUnit: editingUnit)
                } label: {
                    Text("Cancel")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appSurfaceSecondary)
                        .foregroundStyle(Color.appText)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)

                // Save (or Save + update related)
                Button {
                    Task {
                        if cascadeWarning.isEmpty && crossTypeWarning == nil {
                            await saveForm(editingUnit: editingUnit)
                        } else if !cascadeWarning.isEmpty {
                            await saveForm(editingUnit: editingUnit, cascade: cascadeWarning)
                        } else {
                            // crossTypeWarning acknowledged — cleared inside saveForm
                            await saveForm(editingUnit: editingUnit)
                        }
                    }
                } label: {
                    Group {
                        if isSaving {
                            ProgressView().tint(.white)
                        } else {
                            Text(cascadeWarning.isEmpty && crossTypeWarning == nil
                                 ? "Save"
                                 : (!cascadeWarning.isEmpty ? "Save + update related" : "Save anyway"))
                                .font(.appSubhead)
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.md)
                    .background(formCanSave ? accentColor : Color.appBorder)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(!formCanSave || isSaving)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.xxl)
        }
    }

    // MARK: - Helpers

    private var availableUnits: [String] {
        let taken = Set(
            conversions.map(\.unitName)
            + pendingConversions.map(\.unitName)
            + [baseServingUnit, "servings"]
        )
        return allServingUnits.filter { !taken.contains($0) }
    }

    private var filteredAvailableUnits: [String] {
        let query = customUnitText.trimmingCharacters(in: .whitespaces).lowercased()
        if query.isEmpty { return availableUnits }
        return availableUnits.filter { $0.lowercased().contains(query) }
    }

    private var takenUnitNames: Set<String> {
        Set(
            conversions.map { $0.unitName.lowercased() }
            + pendingConversions.map { $0.unitName.lowercased() }
            + [baseServingUnit.lowercased(), "servings"]
        )
    }

    private var customUnitError: String? {
        let trimmed = customUnitText.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return nil }
        if trimmed.count > 30 { return "Unit name must be 30 characters or fewer" }
        if takenUnitNames.contains(trimmed.lowercased()) { return "This unit already exists" }
        if trimmed.lowercased() == "serving" { return "Use \"servings\" instead" }
        return nil
    }

    private var customUnitValid: Bool {
        let trimmed = customUnitText.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && customUnitError == nil
    }

    private func submitCustomUnit() {
        let trimmed = customUnitText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, customUnitError == nil else { return }
        customUnitText = ""
        openForm(for: trimmed)
    }

    private var fromUnitOptions: [String] {
        var units = [baseServingUnit]
        units += conversions.map(\.unitName)
        units += pendingConversions.map(\.unitName)
        return units.filter { $0 != pendingToUnit }
    }

    private var formCanSave: Bool {
        guard let fq = Double(formFromQty), fq > 0 else { return false }
        let tqStr = formToQty.isEmpty ? toQtyPlaceholder : formToQty
        guard let tq = Double(tqStr), tq > 0 else { return false }
        return !pendingToUnit.isEmpty
    }

    /// Dynamic placeholder for the to-qty field: the auto-computed equivalent of
    /// the current fromQty/fromUnit in pendingToUnit. Empty when fromQty is empty
    /// or no conversion path exists.
    private var toQtyPlaceholder: String {
        guard let fq = Double(formFromQty), fq > 0 else { return "" }
        guard let suggested = suggestedToQty(fromUnit: formFromUnit, fromQty: fq) else { return "" }
        return Self.fmt(suggested)
    }

    /// Converts fromQty in fromUnit to pendingToUnit, routing through the base
    /// serving unit and using density for cross-type pairs if available.
    private func suggestedToQty(fromUnit: String, fromQty: Double) -> Double? {
        let baseServings = fromQtyToBaseServings(fromUnit, fromQty)
        let absAmount    = baseServings * baseServingSize
        let existing     = allQIBSTuples().filter { $0.unitName != pendingToUnit }
        let density      = deriveDensity(
            baseServingUnit:     baseServingUnit,
            baseServingSize:     baseServingSize,
            existingConversions: existing)
        return convertUnit(fromUnit: baseServingUnit, fromQty: absAmount, toUnit: pendingToUnit, density: density)
    }

    private func allQIBSTuples() -> [(unitName: String, quantityInBaseServings: Double)] {
        conversions.map { (unitName: $0.unitName, quantityInBaseServings: $0.quantityInBaseServings) }
        + pendingConversions.map { (unitName: $0.unitName, quantityInBaseServings: $0.quantityInBaseServings) }
    }

    private func openForm(for unit: String) {
        pendingToUnit    = unit
        cascadeWarning   = []
        formPickingFrom  = false
        formError        = nil
        let allQIBS      = allQIBSTuples()
        if let auto = tryAutoConvert(
            toUnit:       unit,
            servingUnit:  baseServingUnit,
            servingSize:  baseServingSize,
            existingQIBS: allQIBS)
        {
            formFromUnit = auto.fromUnit
            formFromQty  = Self.fmt(auto.fromQty)
            formToQty    = Self.fmt(auto.toQty)
        } else {
            formFromUnit = baseServingUnit
            let allQIBS  = allQIBSTuples()
            if let density = deriveDensity(
                    baseServingUnit:     baseServingUnit,
                    baseServingSize:     baseServingSize,
                    existingConversions: allQIBS),
               let suggested = suggestCrossTypeConversion(
                    toUnit:          unit,
                    baseServingUnit: baseServingUnit,
                    baseServingSize: baseServingSize,
                    density:         density)
            {
                formFromUnit       = suggested.fromUnit
                formFromQty        = Self.fmt(suggested.fromQty)
                formToQty          = Self.fmt(suggested.toQty)
                crossTypeSuggested = true
            } else {
                // Abstract or unknown cross-type unit — user must fill in both values
                formFromQty        = ""
                formToQty          = ""
                crossTypeSuggested = false
            }
        }
        overlayPanel = .form(editingUnit: nil)
    }

    private func openEditForm(unitName: String) {
        guard let qibs = pendingConversions.first(where: { $0.unitName == unitName })?.quantityInBaseServings
                      ?? conversions.first(where: { $0.unitName == unitName })?.quantityInBaseServings
        else { return }
        pendingToUnit   = unitName
        formFromUnit    = baseServingUnit
        formFromQty     = Self.fmt(qibs * baseServingSize)
        formToQty       = "1"
        cascadeWarning     = []
        crossTypeWarning   = nil
        crossTypeSuggested = false
        formPickingFrom    = false
        formError          = nil
        overlayPanel       = .form(editingUnit: unitName)
    }

    private func deleteUnit(_ unitName: String) {
        if isDraftMode {
            pendingConversions.removeAll { $0.unitName == unitName }
            overlayPanel = .idle
        } else {
            if let conv = conversions.first(where: { $0.unitName == unitName }) {
                Task { try? await onDelete?(conv.id) }
                overlayPanel = .idle
            }
        }
    }

    private func cancelForm(editingUnit: String?) {
        resetFormState()
        if let eu = editingUnit {
            overlayPanel = .unitPreview(unitName: eu)
        } else {
            overlayPanel = .idle
        }
    }

    private func saveForm(editingUnit: String?, cascade: [ConflictItem] = []) async {
        let toQtyStr = formToQty.isEmpty ? toQtyPlaceholder : formToQty
        guard let fromQty = Double(formFromQty), fromQty > 0,
              let toQty   = Double(toQtyStr),    toQty   > 0,
              !pendingToUnit.isEmpty
        else { formError = "Please enter valid numbers."; return }

        let qibs = computeQIBS(fromUnit: formFromUnit, fromQty: fromQty, toQty: toQty)
        guard qibs > 0 else { formError = "Invalid conversion."; return }

        // Conflict checks (only when no override has been provided/acknowledged)
        if cascade.isEmpty && crossTypeWarning == nil {
            let existingForConflict = allQIBSTuples().filter { $0.unitName != pendingToUnit }
            // 1. Same-type cascade check (existing)
            let conflicts = checkConflicts(
                toUnit:              pendingToUnit,
                newQIBS:             qibs,
                existingConversions: existingForConflict)
            if !conflicts.isEmpty {
                cascadeWarning = conflicts
                return
            }
            // 2. Cross-type density consistency check
            if let density = deriveDensity(
                    baseServingUnit:     baseServingUnit,
                    baseServingSize:     baseServingSize,
                    existingConversions: existingForConflict),
               let mismatch = checkCrossTypeConsistency(
                    toUnit:              pendingToUnit,
                    newQIBS:             qibs,
                    baseServingUnit:     baseServingUnit,
                    baseServingSize:     baseServingSize,
                    establishedDensity:  density)
            {
                crossTypeWarning = mismatch
                return
            }
        }
        crossTypeWarning = nil

        isSaving = true
        if isDraftMode {
            var next = pendingConversions.filter { $0.unitName != pendingToUnit }
            next.append(PendingUnitConversion(unitName: pendingToUnit, quantityInBaseServings: qibs))
            for conflict in cascade {
                if let idx = next.firstIndex(where: { $0.unitName == conflict.unitName }) {
                    next[idx].quantityInBaseServings = conflict.newQIBS
                }
            }
            pendingConversions = next
            isSaving = false
            if editingUnit != nil {
                overlayPanel = .unitPreview(unitName: pendingToUnit)
            } else {
                overlayPanel = .idle
            }
        } else {
            do {
                try await onAdd?(pendingToUnit, qibs)
                isSaving = false
                overlayPanel = .idle
            } catch {
                isSaving = false
                formError = error.localizedDescription
            }
        }
        resetFormState()
    }

    private func dismiss() {
        overlayPanel = .idle
        resetFormState()
    }

    private func resetFormState() {
        pendingToUnit      = ""
        formFromUnit       = ""
        formFromQty        = "1"
        formToQty          = ""
        formPickingFrom    = false
        cascadeWarning     = []
        crossTypeWarning   = nil
        crossTypeSuggested = false
        formError          = nil
    }

    // MARK: - QIBS Computation

    private func fromQtyToBaseServings(_ unit: String, _ qty: Double) -> Double {
        if unit == baseServingUnit { return qty / max(baseServingSize, 1e-10) }
        if unit == "servings" { return qty }
        if let c = conversions.first(where: { $0.unitName == unit }) {
            return qty * c.quantityInBaseServings
        }
        if let p = pendingConversions.first(where: { $0.unitName == unit }) {
            return qty * p.quantityInBaseServings
        }
        return qty
    }

    private func computeQIBS(fromUnit: String, fromQty: Double, toQty: Double) -> Double {
        fromQtyToBaseServings(fromUnit, fromQty) / max(toQty, 1e-10)
    }

    // MARK: - Formatting

    private static func fmtDensity(_ d: Double) -> String {
        String(format: "%.2f", d)
    }

    private static func fmt(_ v: Double) -> String {
        let r = (v * 1000).rounded() / 1000
        return r.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(r))
            : String(format: "%.3g", r)
    }
}
