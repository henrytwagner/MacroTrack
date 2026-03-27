import SwiftUI

// MARK: - DraftMealCard

/// Kitchen Mode draft food card with states: normal, pending, disambiguate, choice, creating.
/// Port of mobile/components/DraftMealCard.tsx (simplified for Gemini Live).
///
/// Animations:
/// - Entry: slide-up (20pt) + fade-in
/// - Flash: macro values spring-scale to 1.25x on change
/// - Pulse: opacity oscillates on disambiguate state
struct DraftMealCard: View {
    let item: DraftItem
    let isActive: Bool
    let isEditing: Bool

    // Scale integration
    var scaleReading: ScaleReading? = nil
    var scaleSkipped: Bool = false

    var onSendTranscript: ((String) -> Void)? = nil
    var onRemove: (() -> Void)? = nil
    var onEditQuantity: ((Double, String) -> Void)? = nil
    var onFillManually: ((String, Double, Double, Double, Double, Double, String) -> Void)? = nil
    var onStartEdit: (() -> Void)? = nil
    var onEndEdit: (() -> Void)? = nil
    var onEditPreview: ((Double) -> Void)? = nil
    var onScaleConfirm: ((Double, String) -> Void)? = nil
    var onScaleSkip: (() -> Void)? = nil

    // MARK: - Animation State

    @State private var entryOpacity: Double = 0
    @State private var entryOffset: CGFloat = 20

    @State private var quantityFlash: CGFloat = 1
    @State private var caloriesFlash: CGFloat = 1
    @State private var proteinFlash: CGFloat = 1
    @State private var carbsFlash: CGFloat = 1
    @State private var fatFlash: CGFloat = 1

    @State private var pulseOpacity: Double = 1

    // MARK: - Inline Editing State

    @State private var isManualNutritionMode = false
    @State private var editTimeoutToken: Int = 0
    @State private var focusLossToken: Int = 0
    @FocusState private var quantityFieldFocused: Bool

    // Quantity edit fields
    @State private var editQuantityText: String = ""
    @State private var editUnit: String = ""

    // Manual nutrition form fields
    @State private var editName: String = ""
    @State private var editCalories: String = ""
    @State private var editProtein: String = ""
    @State private var editCarbs: String = ""
    @State private var editFat: String = ""
    @State private var editServingSize: String = ""
    @State private var editServingUnit: String = ""

    private static let commonUnits = [
        "g", "oz", "ml", "cups", "tbsp", "tsp",
        "servings", "pieces", "slices", "portion",
        "can", "bottle", "scoop", "clove", "packet", "L", "fl oz",
    ]

    // Previous values for flash detection
    @State private var prevQuantity: Double?
    @State private var prevCalories: Double?
    @State private var prevProtein: Double?
    @State private var prevCarbs: Double?
    @State private var prevFat: Double?

    // MARK: - Derived

    private var isCompact: Bool {
        !isActive && !isEditing && item.state == .normal
    }

    private var borderColor: Color {
        if isEditing { return .appTint }
        switch item.state {
        case .disambiguate: return .appTint
        case .choice:       return .appWarning
        case .creating:     return .appTint
        case .pending:      return .appBorder
        default:            return .appBorder
        }
    }

    // MARK: - Body

    var body: some View {
        cardContent
            .padding(isCompact ? Spacing.md : Spacing.lg)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: BorderRadius.lg)
                    .stroke(borderColor, lineWidth: 1.5)
            )
            .opacity(entryOpacity * pulseOpacity)
            .offset(y: entryOffset)
            .onAppear {
                // Entry animation: slide up + fade in
                withAnimation(.easeOut(duration: 0.28)) {
                    entryOpacity = 1
                }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                    entryOffset = 0
                }
            }
            .onChange(of: item.state) { oldState, newState in
                startPulseIfNeeded(newState)
                // Only collapse editing if state actually changed (not echoes).
                if isEditing && oldState != newState {
                    onEndEdit?()
                }
            }
            .onAppear {
                startPulseIfNeeded(item.state)
            }
            .onChange(of: item.quantity) { old, new in
                guard !isEditing else { prevQuantity = new; return }
                if prevQuantity != nil && old != new { fireFlash($quantityFlash) }
                prevQuantity = new
            }
            .onChange(of: item.calories) { old, new in
                guard !isEditing else { prevCalories = new; return }
                if prevCalories != nil && old != new { fireFlash($caloriesFlash) }
                prevCalories = new
            }
            .onChange(of: item.proteinG) { old, new in
                guard !isEditing else { prevProtein = new; return }
                if prevProtein != nil && old != new { fireFlash($proteinFlash) }
                prevProtein = new
            }
            .onChange(of: item.carbsG) { old, new in
                guard !isEditing else { prevCarbs = new; return }
                if prevCarbs != nil && old != new { fireFlash($carbsFlash) }
                prevCarbs = new
            }
            .onChange(of: item.fatG) { old, new in
                guard !isEditing else { prevFat = new; return }
                if prevFat != nil && old != new { fireFlash($fatFlash) }
                prevFat = new
            }
            .task {
                // Initialize prev values (skip flash on first render)
                prevQuantity = item.quantity
                prevCalories = item.calories
                prevProtein = item.proteinG
                prevCarbs = item.carbsG
                prevFat = item.fatG
            }
            // Initialize/commit edit fields when editing state changes
            .onChange(of: isEditing) { wasEditing, nowEditing in
                if nowEditing && !isManualNutritionMode {
                    // Init quantity edit fields
                    editQuantityText = formatNumber(item.quantity)
                    editUnit = item.unit
                    editTimeoutToken = 0
                    onEditPreview?(item.quantity)
                    // Auto-focus the quantity field after a brief delay
                    // (SwiftUI needs a runloop tick to lay out the TextField)
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(100))
                        quantityFieldFocused = true
                    }
                }
                if wasEditing && !nowEditing && !isManualNutritionMode {
                    // Auto-commit quantity edit
                    quantityFieldFocused = false
                    if let qty = Double(editQuantityText), qty > 0,
                       !editUnit.trimmingCharacters(in: .whitespaces).isEmpty {
                        onEditQuantity?(qty, editUnit)
                    }
                }
                if !nowEditing {
                    isManualNutritionMode = false
                }
            }
            // Auto-timeout for quantity editing (not nutrition form)
            .task(id: editTimeoutToken) {
                guard isEditing && !isManualNutritionMode else { return }
                do {
                    try await Task.sleep(for: .seconds(8))
                } catch {
                    return
                }
                guard isEditing && !isManualNutritionMode else { return }
                onEndEdit?()
            }
            // Tap-outside-to-save: when focus leaves the quantity field,
            // wait briefly (Menu popups may drop focus momentarily) then close.
            .onChange(of: quantityFieldFocused) { _, focused in
                if !focused && isEditing && !isManualNutritionMode {
                    focusLossToken += 1
                }
            }
            .task(id: focusLossToken) {
                guard focusLossToken > 0 else { return }
                guard isEditing && !isManualNutritionMode else { return }
                do {
                    try await Task.sleep(for: .milliseconds(350))
                } catch { return }
                // If focus returned (e.g. Menu closed), don't close
                guard !quantityFieldFocused else { return }
                guard isEditing && !isManualNutritionMode else { return }
                onEndEdit?()
            }
    }

    // MARK: - Card Content

    @ViewBuilder
    private var cardContent: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            switch item.state {
            case .normal:
                if isEditing {
                    inlineQuantityEditor
                } else if isCompact {
                    compactNormalContent
                } else {
                    expandedNormalContent
                }
            case .pending:
                pendingContent
            case .disambiguate:
                disambiguateContent
            case .choice:
                choiceContent
            case .creating:
                if isManualNutritionMode {
                    inlineNutritionForm
                } else {
                    creatingContent
                }
            default:
                // Other states handled by Gemini voice — show minimal card
                expandedNormalContent
            }
        }
    }

    // MARK: - Expanded Normal Card (active)

    private var expandedNormalContent: some View {
        Group {
            // Header
            HStack {
                Text(item.name)
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                HStack(spacing: Spacing.xs) {
                    if item.isAssumed == true {
                        Text("\u{2726}assumed")
                            .font(.appCaption2)
                            .tracking(Typography.Tracking.caption2)
                            .foregroundStyle(Color.appTextTertiary)
                    }
                    sourceIcon
                }
            }

            // Quantity
            Text("\(formatNumber(item.quantity)) \(item.unit)")
                .font(.appSubhead)
                .tracking(Typography.Tracking.subhead)
                .foregroundStyle(Color.appTextSecondary)
                .scaleEffect(quantityFlash)

            // Scale chip — offer to apply stable scale reading
            if let reading = scaleReading,
               reading.stable,
               !scaleSkipped,
               item.state == .normal {
                scaleConfirmChip(reading)
                    .transition(.scale.combined(with: .opacity))
            }

            // Macro chips
            macroRow
        }
        .contentShape(Rectangle())
        .onTapGesture { onStartEdit?() }
    }

    // MARK: - Compact Normal Card (inactive)

    private var compactNormalContent: some View {
        Group {
            // Header
            HStack {
                Text(item.name)
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                HStack(spacing: Spacing.xs) {
                    if item.isAssumed == true {
                        Text("\u{2726}assumed")
                            .font(.appCaption2)
                            .tracking(Typography.Tracking.caption2)
                            .foregroundStyle(Color.appTextTertiary)
                    }
                    sourceIcon
                }
            }

            // Quantity
            Text("\(formatNumber(item.quantity)) \(item.unit)")
                .font(.appCaption2)
                .tracking(Typography.Tracking.caption2)
                .foregroundStyle(Color.appTextSecondary)
                .scaleEffect(quantityFlash)

            // Macro chips
            macroRow
        }
        .contentShape(Rectangle())
        .onTapGesture { onStartEdit?() }
    }

    // MARK: - Pending Card

    private var pendingContent: some View {
        Group {
            HStack {
                Text(item.name)
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                ProgressView()
                    .controlSize(.small)
            }

            Text("Looking up\u{2026}")
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextSecondary)
        }
    }

    // MARK: - Disambiguate Card

    private var disambiguateContent: some View {
        Group {
            // Header
            HStack {
                Text(item.name)
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                Image(systemName: "questionmark.circle")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.appTint)
            }

            Text("Which one did you mean?")
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextSecondary)

            // Option buttons
            if let options = item.disambiguationOptions {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button {
                        onSendTranscript?("\(index + 1)")
                    } label: {
                        Text("\(index + 1). \(option.label)")
                            .font(.appFootnote)
                            .tracking(Typography.Tracking.footnote)
                            .fontWeight(.semibold)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.xs)
                            .padding(.horizontal, Spacing.sm)
                    }
                    .buttonStyle(ChoiceButtonStyle(color: .appTint))
                    .padding(.top, index == 0 ? Spacing.xs : 0)
                }
            }
        }
    }

    // MARK: - Choice Card (not found — create vs USDA)

    private var choiceContent: some View {
        Group {
            // Header
            HStack {
                Text(item.name)
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.appWarning)
            }

            Text("Not found in your foods")
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextSecondary)

            // Action buttons
            VStack(spacing: Spacing.xs) {
                Button {
                    onSendTranscript?("create it")
                } label: {
                    Text("Create new food")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.xs)
                        .padding(.horizontal, Spacing.sm)
                }
                .buttonStyle(ChoiceButtonStyle(color: .appTint))

                Button {
                    onSendTranscript?("try USDA")
                } label: {
                    Text("Try USDA (less reliable)")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.xs)
                        .padding(.horizontal, Spacing.sm)
                }
                .buttonStyle(ChoiceButtonStyle(color: .appTextSecondary))

                Button {
                    onSendTranscript?("never mind")
                } label: {
                    Text("Never mind")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.xs)
                        .padding(.horizontal, Spacing.sm)
                }
                .buttonStyle(ChoiceButtonStyle(color: .appTextSecondary))
            }
            .padding(.top, Spacing.xs)
        }
    }

    // MARK: - Creating Card (progressive field fill)

    private var creatingContent: some View {
        let progress = item.creatingProgress
        return Group {
            // Header
            HStack {
                Text(item.name)
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                ProgressView()
                    .controlSize(.small)
            }

            // Current field prompt
            if let progress {
                Text(creatingFieldLabel(progress.currentField))
                    .font(.appCaption1)
                    .tracking(Typography.Tracking.caption1)
                    .foregroundStyle(Color.appTextSecondary)
                    .transition(.opacity)
                    .id(progress.currentField) // re-renders on field change
            }

            // Serving size (shows once collected)
            if let progress, let size = progress.servingSize, let unit = progress.servingUnit {
                Text("\(formatNumber(size, decimals: size.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)) \(unit)")
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .transition(.opacity.combined(with: .move(edge: .leading)))
            }

            // Macro chips — collected values flash in; uncollected show "—"
            HStack(spacing: Spacing.xs) {
                if let cal = progress?.calories {
                    MacroChip(label: "cal", value: cal, color: .caloriesAccent)
                } else {
                    PlaceholderChip(label: "cal", color: .caloriesAccent)
                }
                if let p = progress?.proteinG {
                    MacroChip(label: "P", value: p, color: .proteinAccent)
                } else {
                    PlaceholderChip(label: "P", color: .proteinAccent)
                }
                if let c = progress?.carbsG {
                    MacroChip(label: "C", value: c, color: .carbsAccent)
                } else {
                    PlaceholderChip(label: "C", color: .carbsAccent)
                }
                if let f = progress?.fatG {
                    MacroChip(label: "F", value: f, color: .fatAccent)
                } else {
                    PlaceholderChip(label: "F", color: .fatAccent)
                }
            }
            .padding(.top, 2)
            .animation(.easeOut(duration: 0.2), value: progress?.calories)
            .animation(.easeOut(duration: 0.2), value: progress?.proteinG)
            .animation(.easeOut(duration: 0.2), value: progress?.carbsG)
            .animation(.easeOut(duration: 0.2), value: progress?.fatG)

            // Touch fallback — fill in nutrition manually
            Button {
                initNutritionFormFields()
                isManualNutritionMode = true
                onStartEdit?()
            } label: {
                Text("Fill in manually")
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.xs)
                    .padding(.horizontal, Spacing.sm)
            }
            .buttonStyle(ChoiceButtonStyle(color: .appTextSecondary))
            .padding(.top, Spacing.sm)
        }
    }

    private func creatingFieldLabel(_ field: CreatingFoodField) -> String {
        switch field {
        case .confirm:     return "Creating food\u{2026}"
        case .servingSize: return "Serving size?"
        case .calories:    return "Calories per serving?"
        case .protein:     return "Protein (g)?"
        case .carbs:       return "Carbs (g)?"
        case .fat:         return "Fat (g)?"
        case .brand:       return "Brand? (say \u{2018}skip\u{2019} to skip)"
        case .barcode:     return "Barcode? (say \u{2018}skip\u{2019} to skip)"
        case .complete:    return "Almost done\u{2026}"
        }
    }

    // MARK: - Scale Chip

    private func scaleConfirmChip(_ reading: ScaleReading) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "scalemass.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color.appTint)

            Text("Use \(reading.display)?")
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appText)

            Spacer()

            // Confirm
            Button {
                onScaleConfirm?(reading.value, reading.unit.rawValue)
            } label: {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Color.appTint)
            }

            // Skip
            Button {
                onScaleSkip?()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Color.appTextTertiary)
            }
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.xs)
        .background(Color.appTint.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
    }

    // MARK: - Shared Sub-views

    private var macroRow: some View {
        HStack(spacing: Spacing.xs) {
            MacroChip(label: "cal", value: item.calories, color: .caloriesAccent,
                      flash: caloriesFlash)
            MacroChip(label: "P", value: item.proteinG, color: .proteinAccent,
                      flash: proteinFlash)
            MacroChip(label: "C", value: item.carbsG, color: .carbsAccent,
                      flash: carbsFlash)
            MacroChip(label: "F", value: item.fatG, color: .fatAccent,
                      flash: fatFlash)
        }
        .padding(.top, 2)
    }

    /// Scale factor from the edited quantity relative to the item's stored quantity.
    private var editScaleFactor: Double {
        guard item.quantity > 0,
              let editQty = Double(editQuantityText), editQty > 0
        else { return 1 }
        return editQty / item.quantity
    }

    /// Macro row that scales live based on the edited quantity.
    private var liveMacroRow: some View {
        let scale = editScaleFactor
        return HStack(spacing: Spacing.xs) {
            MacroChip(label: "cal", value: item.calories * scale, color: .caloriesAccent)
            MacroChip(label: "P", value: item.proteinG * scale, color: .proteinAccent)
            MacroChip(label: "C", value: item.carbsG * scale, color: .carbsAccent)
            MacroChip(label: "F", value: item.fatG * scale, color: .fatAccent)
        }
        .padding(.top, 2)
        .animation(.easeOut(duration: 0.15), value: editQuantityText)
    }

    @ViewBuilder
    private var sourceIcon: some View {
        let iconName: String = {
            switch item.source {
            case .custom:    return "person.circle"
            case .community: return "person.2"
            case .database:  return "exclamationmark.triangle"
            }
        }()
        let iconColor: Color = {
            switch item.source {
            case .custom:    return .appTint
            case .community: return .appSuccess
            case .database:  return .appWarning
            }
        }()
        Image(systemName: iconName)
            .font(.system(size: 14))
            .foregroundStyle(iconColor)
    }

    // MARK: - Inline Quantity Editor

    private var inlineQuantityEditor: some View {
        Group {
            // Header (same as expanded normal)
            HStack {
                Text(item.name)
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                HStack(spacing: Spacing.xs) {
                    if item.isAssumed == true {
                        Text("\u{2726}assumed")
                            .font(.appCaption2)
                            .tracking(Typography.Tracking.caption2)
                            .foregroundStyle(Color.appTextTertiary)
                    }
                    sourceIcon
                }
            }

            // Editable quantity + unit row
            HStack(spacing: Spacing.sm) {
                TextField("0", text: $editQuantityText)
                    .keyboardType(.decimalPad)
                    .focused($quantityFieldFocused)
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
                    .background(Color.gray.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .frame(maxWidth: 100)
                    .onChange(of: editQuantityText) { _, newVal in
                        editTimeoutToken += 1
                        if let qty = Double(newVal), qty > 0 {
                            onEditPreview?(qty)
                        }
                    }

                Menu {
                    ForEach(unitOptions, id: \.self) { u in
                        Button(u) {
                            editUnit = u
                            editTimeoutToken += 1
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(editUnit)
                            .font(.appSubhead)
                            .tracking(Typography.Tracking.subhead)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
                    .background(Color.gray.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }
            }

            // Macro chips (live-scaled by edited quantity)
            liveMacroRow

            // Delete button
            HStack {
                Spacer()
                Button(role: .destructive) {
                    onRemove?()
                } label: {
                    Label("Remove", systemImage: "trash")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                }
                .foregroundStyle(.red)
            }
        }
        .transition(.opacity)
    }

    // MARK: - Inline Nutrition Form

    private var inlineNutritionForm: some View {
        Group {
            // Name field
            inlineFormRow("Name") {
                TextField("Food name", text: $editName)
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
            }

            // Serving size + unit
            inlineFormRow("Serving") {
                HStack(spacing: Spacing.xs) {
                    TextField("100", text: $editServingSize)
                        .keyboardType(.decimalPad)
                        .frame(maxWidth: 80)
                    TextField("g", text: $editServingUnit)
                        .frame(maxWidth: 50)
                        .foregroundStyle(Color.appTextSecondary)
                }
                .font(.appSubhead)
                .tracking(Typography.Tracking.subhead)
            }

            // Macro fields
            inlineNutritionRow("Cal", text: $editCalories, unit: "kcal")
            inlineNutritionRow("Protein", text: $editProtein, unit: "g")
            inlineNutritionRow("Carbs", text: $editCarbs, unit: "g")
            inlineNutritionRow("Fat", text: $editFat, unit: "g")

            // Action buttons
            HStack {
                Button(role: .destructive) {
                    onEndEdit?()
                    onRemove?()
                } label: {
                    Label("Delete", systemImage: "trash")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                }
                .foregroundStyle(.red)

                Spacer()

                Button {
                    submitNutritionForm()
                } label: {
                    Label("Add Food", systemImage: "checkmark")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .fontWeight(.semibold)
                }
                .buttonStyle(ChoiceButtonStyle(color: .appTint))
                .disabled(!isNutritionFormValid)
            }
            .padding(.top, Spacing.xs)
        }
        .transition(.opacity)
    }

    // MARK: - Inline Form Helpers

    @ViewBuilder
    private func inlineFormRow<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(label)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextSecondary)
                .frame(width: 60, alignment: .leading)
            content()
        }
    }

    @ViewBuilder
    private func inlineNutritionRow(_ label: String, text: Binding<String>, unit: String) -> some View {
        HStack {
            Text(label)
                .font(.appCaption1)
                .tracking(Typography.Tracking.caption1)
                .foregroundStyle(Color.appTextSecondary)
                .frame(width: 60, alignment: .leading)
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .font(.appSubhead)
                .tracking(Typography.Tracking.subhead)
                .frame(maxWidth: 80)
            Text(unit)
                .font(.appCaption2)
                .tracking(Typography.Tracking.caption2)
                .foregroundStyle(Color.appTextTertiary)
        }
    }

    private var isNutritionFormValid: Bool {
        guard !editName.trimmingCharacters(in: .whitespaces).isEmpty,
              let cal = Double(editCalories), cal >= 0,
              let p   = Double(editProtein),  p   >= 0,
              let c   = Double(editCarbs),    c   >= 0,
              let f   = Double(editFat),      f   >= 0,
              let ss  = Double(editServingSize), ss > 0,
              !editServingUnit.trimmingCharacters(in: .whitespaces).isEmpty
        else { return false }
        return true
    }

    private func initNutritionFormFields() {
        let p = item.creatingProgress
        editName = item.name
        editCalories = formatOptionalDouble(p?.calories)
        editProtein = formatOptionalDouble(p?.proteinG)
        editCarbs = formatOptionalDouble(p?.carbsG)
        editFat = formatOptionalDouble(p?.fatG)
        editServingSize = formatOptionalDouble(p?.servingSize)
        editServingUnit = p?.servingUnit ?? "g"
    }

    private func submitNutritionForm() {
        guard isNutritionFormValid,
              let cal = Double(editCalories),
              let p   = Double(editProtein),
              let c   = Double(editCarbs),
              let f   = Double(editFat),
              let ss  = Double(editServingSize)
        else { return }
        onFillManually?(editName.trimmingCharacters(in: .whitespaces),
                        cal, p, c, f, ss,
                        editServingUnit.trimmingCharacters(in: .whitespaces))
        onEndEdit?()
    }

    private func formatOptionalDouble(_ value: Double?) -> String {
        guard let v = value else { return "" }
        return v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }

    private var unitOptions: [String] {
        var opts = Self.commonUnits
        if !opts.contains(item.unit) { opts.insert(item.unit, at: 0) }
        return opts
    }

    // MARK: - Flash Animation

    /// Spring-scale to 1.25x then back to 1.0 — matches RN spring(tension:300,friction:6→8)
    private func fireFlash(_ binding: Binding<CGFloat>) {
        withAnimation(.spring(response: 0.15, dampingFraction: 0.4)) {
            binding.wrappedValue = 1.25
        }
        // Return to 1.0 after a short delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                binding.wrappedValue = 1.0
            }
        }
    }

    // MARK: - Pulse Animation

    private func startPulseIfNeeded(_ state: DraftCardState) {
        if state == .disambiguate || state == .choice || state == .creating {
            withAnimation(
                .easeInOut(duration: 0.7)
                .repeatForever(autoreverses: true)
            ) {
                pulseOpacity = 0.7
            }
        } else {
            withAnimation(.easeOut(duration: 0.2)) {
                pulseOpacity = 1.0
            }
        }
    }

    // MARK: - Helpers

    private func formatNumber(_ n: Double, decimals: Int = 0) -> String {
        if decimals == 0 {
            return String(Int(n.rounded()))
        }
        return String(format: "%.\(decimals)f", n)
    }
}

// MARK: - MacroChip

private struct MacroChip: View {
    let label: String
    let value: Double
    let color: Color
    var flash: CGFloat = 1

    var body: some View {
        HStack(spacing: 3) {
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)

            Text(formattedValue)
                .font(.appCaption2)
                .tracking(Typography.Tracking.caption2)
                .opacity(0.85)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, 2)
        .background(Color.gray.opacity(0.08))
        .clipShape(Capsule())
        .scaleEffect(flash)
    }

    private var formattedValue: String {
        if label == "cal" {
            return "\(Int(value.rounded())) cal"
        }
        return String(format: "%.1fg %@", value, label)
    }
}

// MARK: - PlaceholderChip

/// Dash chip for macro fields not yet collected during food creation.
private struct PlaceholderChip: View {
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 3) {
            Circle()
                .fill(color.opacity(0.3))
                .frame(width: 5, height: 5)

            Text("— \(label)")
                .font(.appCaption2)
                .tracking(Typography.Tracking.caption2)
                .opacity(0.4)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, 2)
        .background(Color.gray.opacity(0.05))
        .clipShape(Capsule())
    }
}

// MARK: - ChoiceButtonStyle

/// Outlined pill button matching the RN choiceButton style.
private struct ChoiceButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? .white : color)
            .padding(.vertical, Spacing.xs)
            .padding(.horizontal, Spacing.sm)
            .frame(maxWidth: .infinity)
            .background(
                configuration.isPressed ? color : Color.clear
            )
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(color, lineWidth: 1.5)
            )
    }
}

// MARK: - Preview

#Preview("Normal (expanded)") {
    DraftMealCard(
        item: DraftItem(
            id: "1", name: "Chicken Breast", quantity: 100, unit: "g",
            calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
            source: .database, mealLabel: .lunch, state: .normal),
        isActive: true,
        isEditing: false
    )
    .padding()
}

#Preview("Normal (compact)") {
    DraftMealCard(
        item: DraftItem(
            id: "2", name: "Brown Rice", quantity: 80, unit: "g",
            calories: 88, proteinG: 2, carbsG: 18.4, fatG: 0.7,
            source: .custom, mealLabel: .lunch, state: .normal),
        isActive: false,
        isEditing: false
    )
    .padding()
}

#Preview("Inline Quantity Edit") {
    DraftMealCard(
        item: DraftItem(
            id: "3", name: "Chicken Breast", quantity: 100, unit: "g",
            calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
            source: .database, mealLabel: .lunch, state: .normal),
        isActive: true,
        isEditing: true
    )
    .padding()
}

#Preview("Pending") {
    DraftMealCard(
        item: DraftItem(
            id: "3", name: "Salmon", quantity: 1, unit: "servings",
            calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
            source: .database, mealLabel: .dinner, state: .pending),
        isActive: true,
        isEditing: false
    )
    .padding()
}

#Preview("Creating (mid-fill)") {
    DraftMealCard(
        item: DraftItem(
            id: "5", name: "Acai Bowl", quantity: 1, unit: "servings",
            calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
            source: .custom, mealLabel: .lunch, state: .creating,
            creatingProgress: CreatingFoodProgress(
                servingSize: 100, servingUnit: "g",
                calories: 200, proteinG: nil, carbsG: nil, fatG: nil,
                currentField: .protein)),
        isActive: true,
        isEditing: false
    )
    .padding()
}

#Preview("Disambiguate") {
    DraftMealCard(
        item: DraftItem(
            id: "4", name: "Chicken", quantity: 1, unit: "servings",
            calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
            source: .database, mealLabel: .lunch, state: .disambiguate,
            disambiguationOptions: [
                DisambiguationOption(
                    label: "Chicken breast, grilled",
                    usdaResult: USDASearchResult(
                        fdcId: 1, description: "Chicken breast, grilled",
                        servingSize: 100, servingSizeUnit: "g",
                        macros: Macros(calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6))),
                DisambiguationOption(
                    label: "Chicken thigh, roasted",
                    usdaResult: USDASearchResult(
                        fdcId: 2, description: "Chicken thigh, roasted",
                        servingSize: 100, servingSizeUnit: "g",
                        macros: Macros(calories: 209, proteinG: 26, carbsG: 0, fatG: 10.9))),
            ]),
        isActive: true,
        isEditing: false
    )
    .padding()
}
