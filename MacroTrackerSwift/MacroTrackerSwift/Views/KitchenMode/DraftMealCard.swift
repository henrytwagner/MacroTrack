import SwiftUI

// MARK: - DraftMealCard

/// Kitchen Mode draft food card — dark glassmorphic design.
///
/// Two visual modes:
/// - **Hero**: Large card with giant macro dashboard (one at a time)
/// - **Compact**: Condensed 2-line card for previous entries
///
/// Animations:
/// - Entry: slide-up (20pt) + fade-in
/// - Flash: macro values spring-scale to 1.25x on change
/// - Pulse: opacity oscillates on disambiguate/choice/creating states
/// - Expand/collapse: spring animation when switching hero ↔ compact
struct DraftMealCard: View {
    let item: DraftItem
    let isHero: Bool
    let isEditing: Bool
    var heroMinHeight: CGFloat? = nil

    // Scale integration
    var scaleReading: ScaleReading? = nil
    var scaleSkipped: Bool = false
    var isScaleConnected: Bool = false
    var itemHasWeightUnit: Bool = false

    // Zero offset
    var hasZeroOffset: Bool = false
    var keepZeroOffset: Bool = false

    // Subtractive weighing
    var isSubtractiveMode: Bool = false
    var subtractiveStartWeight: Double? = nil
    var subtractiveDelta: Double? = nil

    var onSendTranscript: ((String) -> Void)? = nil
    var onRemove: (() -> Void)? = nil
    var onEditQuantity: ((Double, String) -> Void)? = nil
    var onFillManually: ((String, Double, Double, Double, Double, Double, String) -> Void)? = nil
    var onStartEdit: (() -> Void)? = nil
    var onEndEdit: (() -> Void)? = nil
    var onEditPreview: ((Double) -> Void)? = nil
    var onScaleConfirm: ((Double, String) -> Void)? = nil
    var onScaleSkip: (() -> Void)? = nil
    var onReweigh: (() -> Void)? = nil
    var onSearchManually: ((String) -> Void)? = nil
    var onSelectDisambiguateOption: ((DisambiguationOption) -> Void)? = nil
    var onTapToExpand: (() -> Void)? = nil
    var onZeroScale: (() -> Void)? = nil
    var onClearZero: (() -> Void)? = nil
    var onToggleKeepZero: (() -> Void)? = nil
    var onStartSubtractive: (() -> Void)? = nil
    var onCancelSubtractive: (() -> Void)? = nil
    var onConfirmSubtractive: (() -> Void)? = nil

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

    /// Available units for this food: base unit + "servings" + saved conversions + same-system auto-units.
    private var availableUnits: [String] {
        let baseUnit = item.baseServingUnit ?? item.unit
        var units: [String] = [baseUnit, "servings"]

        // Add saved conversions
        for conv in item.conversions {
            if !units.contains(conv.unitName) {
                units.append(conv.unitName)
            }
        }

        // Auto-include same-system units from ratio tables
        if weightRatiosG[baseUnit] != nil {
            for key in weightRatiosG.keys where !units.contains(key) {
                units.append(key)
            }
        } else if volumeRatiosMl[baseUnit] != nil {
            for key in volumeRatiosMl.keys where !units.contains(key) {
                units.append(key)
            }
        }

        return units
    }

    // Stable macro preview for live scale weighing (only updates on stable readings)
    @State private var stableMacroPreview: Macros? = nil

    @State private var confirmQtyPulse: Double = 1

    // Previous values for flash detection
    @State private var prevQuantity: Double?
    @State private var prevCalories: Double?
    @State private var prevProtein: Double?
    @State private var prevCarbs: Double?
    @State private var prevFat: Double?

    // MARK: - Derived

    private var isCompact: Bool {
        !isHero && !isEditing && item.state == .normal
    }

    /// Whether to enforce hero minimum height (only for normal state).
    private var effectiveMinHeight: CGFloat? {
        isHero && item.state == .normal ? heroMinHeight : nil
    }

    // MARK: - Body

    var body: some View {
        cardContent
            .glassCard(isHero: isHero)
            .frame(minHeight: effectiveMinHeight)
            .opacity(entryOpacity * pulseOpacity)
            .offset(y: entryOffset)
            .animation(.spring(response: 0.45, dampingFraction: 0.85), value: isHero)
            .onAppear {
                withAnimation(.easeOut(duration: 0.28)) {
                    entryOpacity = 1
                }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                    entryOffset = 0
                }
            }
            .onChange(of: item.state) { oldState, newState in
                startPulseIfNeeded(newState)
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
                prevQuantity = item.quantity
                prevCalories = item.calories
                prevProtein = item.proteinG
                prevCarbs = item.carbsG
                prevFat = item.fatG
                // Local items in .creating state skip the voice-driven creation UI
                // and go straight to the inline manual form.
                if item.isLocalItem && item.state == .creating {
                    initNutritionFormFields()
                    isManualNutritionMode = true
                }
            }
            .onChange(of: isEditing) { wasEditing, nowEditing in
                if nowEditing && !isManualNutritionMode {
                    editQuantityText = formatNumber(item.quantity)
                    editUnit = item.unit
                    editTimeoutToken = 0
                    onEditPreview?(item.quantity)
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(100))
                        quantityFieldFocused = true
                    }
                }
                if wasEditing && !nowEditing && !isManualNutritionMode {
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
                guard !quantityFieldFocused else { return }
                guard isEditing && !isManualNutritionMode else { return }
                onEndEdit?()
            }
    }

    // MARK: - Card Content

    @ViewBuilder
    private var cardContent: some View {
        VStack(alignment: .leading, spacing: isHero ? Spacing.lg : Spacing.xs) {
            switch item.state {
            case .normal:
                if isEditing {
                    inlineQuantityEditor
                } else if isCompact {
                    compactNormalContent
                } else {
                    heroNormalContent
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
                heroNormalContent
            }
        }
    }

    // MARK: - Hero Normal Card

    @ViewBuilder
    private var heroNormalContent: some View {
        if item.state == .normal && !item.quantityConfirmed {
            incompleteQuantityContent
        } else {
            confirmedHeroContent
        }
    }

    private var confirmedHeroContent: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            // Name + source
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(2)

                Spacer()

                sourceIcon
            }

            // Quantity (tap number → manual edit) + scale icon
            HStack(spacing: Spacing.sm) {
                Text("\(formatNumber(item.quantity, decimals: decimalsForUnit(item.unit))) \(item.unit)")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.appTextSecondary)
                    .scaleEffect(quantityFlash)
                    .contentShape(Rectangle())
                    .onTapGesture { onStartEdit?() }

                if item.confirmedViaScale {
                    // Always show scale icon for scale-confirmed items
                    if isScaleConnected {
                        // Tappable — allows reweigh
                        Button {
                            onReweigh?()
                        } label: {
                            Image(systemName: "scalemass.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(Color.appTint)
                        }
                        .buttonStyle(.plain)
                    } else {
                        // Decorative — scale not connected
                        Image(systemName: "scalemass.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.appTint.opacity(0.5))
                    }
                }
            }

            // Macro dashboard
            macroDashboard(
                cal: item.calories, protein: item.proteinG,
                carbs: item.carbsG, fat: item.fatG
            )

            // Action bar
            heroActionBar
        }
    }

    // MARK: - Macro Dashboard (Hero)

    private func macroDashboard(cal: Double, protein: Double, carbs: Double, fat: Double) -> some View {
        HStack(spacing: 0) {
            macroDashboardColumn(value: cal, label: "Cal", color: Color.caloriesAccent, flash: caloriesFlash)
            macroDashboardColumn(value: protein, label: "Protein", color: Color.proteinAccent, flash: proteinFlash)
            macroDashboardColumn(value: carbs, label: "Carbs", color: Color.carbsAccent, flash: carbsFlash)
            macroDashboardColumn(value: fat, label: "Fat", color: Color.fatAccent, flash: fatFlash)
        }
    }

    private func macroDashboardColumn(value: Double, label: String, color: Color, flash: CGFloat = 1) -> some View {
        VStack(spacing: 4) {
            Text(label == "Cal" ? "\(Int(value.rounded()))" : String(format: "%.1fg", value))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(Color.appText)
                .scaleEffect(flash)

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(height: 3)
                .padding(.horizontal, Spacing.sm)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Hero Action Bar

    private var heroActionBar: some View {
        HStack {
            Button {
                onStartEdit?()
            } label: {
                Label("Edit", systemImage: "pencil")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(KitchenTheme.cardBorder, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Button {
                onRemove?()
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appDestructive)
                    .padding(Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
                    .clipShape(Circle())
                    .overlay(Circle().stroke(KitchenTheme.cardBorder, lineWidth: 1))
            }
            .buttonStyle(.plain)

            Spacer()

            if item.isAssumed == true {
                Text("\u{2726}assumed")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.appTextTertiary)
            }
        }
    }

    // MARK: - Incomplete Quantity Content (needs confirmation)

    @ViewBuilder
    private var incompleteQuantityContent: some View {
        if item.scaleWeighingActive && isScaleConnected {
            if isSubtractiveMode {
                subtractiveWeighingContent
            } else {
                scaleWeighingContent
            }
        } else {
            manualQuantityContent
        }
    }

    /// Live scale weighing mode — shows real-time weight and lock-in button.
    private var scaleWeighingContent: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            // Header
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()
                sourceIcon
            }

            if let reading = scaleReading {
                // Live weight display
                Text(reading.display)
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appTint)
                    .contentTransition(.numericText())
                    .animation(.easeOut(duration: 0.15), value: reading.display)

                // Macro preview (updates on stable readings)
                if let macros = stableMacroPreview {
                    macroDashboard(cal: macros.calories, protein: macros.proteinG,
                                   carbs: macros.carbsG, fat: macros.fatG)
                }

                // Lock in + Subtract buttons
                HStack(spacing: Spacing.sm) {
                    Button {
                        onScaleConfirm?(reading.value, reading.unit.rawValue)
                    } label: {
                        HStack(spacing: Spacing.sm) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 13))
                            Text("Lock in")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                        .frame(maxWidth: .infinity)
                        .background(reading.value > 0 ? Color.appTint : Color.appTint.opacity(0.4))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(reading.value <= 0)

                    Button {
                        onStartSubtractive?()
                    } label: {
                        HStack(spacing: Spacing.xs) {
                            Image(systemName: "minus.circle")
                                .font(.system(size: 13))
                            Text("Subtract")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(Color.appText)
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.sm)
                        .background(Color.white.opacity(0.1))
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }

                // Zero button + Keep Zero toggle
                HStack(spacing: Spacing.sm) {
                    Button {
                        if hasZeroOffset {
                            onClearZero?()
                        } else {
                            onZeroScale?()
                        }
                    } label: {
                        HStack(spacing: Spacing.xs) {
                            Image(systemName: hasZeroOffset ? "arrow.counterclockwise" : "scope")
                                .font(.system(size: 12))
                            Text(hasZeroOffset ? "Reset Zero" : "Zero")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(hasZeroOffset ? Color.caloriesAccent : Color.appTextSecondary)
                    }
                    .buttonStyle(.plain)

                    if hasZeroOffset {
                        Button {
                            onToggleKeepZero?()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: keepZeroOffset ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 11))
                                Text("Keep zero")
                                    .font(.system(size: 11))
                            }
                            .foregroundStyle(keepZeroOffset ? Color.appTint : Color.appTextSecondary)
                        }
                        .buttonStyle(.plain)
                    }

                    Spacer()
                }
            } else {
                // Connected but no reading yet
                HStack(spacing: Spacing.sm) {
                    ProgressView()
                        .tint(Color.appTextSecondary)
                    Text("Place food on scale…")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appTextSecondary)
                }
                .padding(.vertical, Spacing.md)
            }

            // Manual fallback
            Button {
                onStartEdit?()
            } label: {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "pencil")
                        .font(.system(size: 12))
                    Text("Set manually")
                        .font(.system(size: 12))
                }
                .foregroundStyle(Color.appTextSecondary)
            }
            .buttonStyle(.plain)
        }
        .onChange(of: scaleReading) { _, newReading in
            guard item.scaleWeighingActive,
                  let reading = newReading,
                  reading.stable else { return }
            stableMacroPreview = scaledMacrosForReading(reading)
        }
        .onAppear {
            if let reading = scaleReading, reading.stable {
                stableMacroPreview = scaledMacrosForReading(reading)
            }
        }
    }

    /// Subtractive weighing mode — lock start weight, show live delta as food is removed.
    private var subtractiveWeighingContent: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            // Header
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()
                sourceIcon
            }

            // Start weight (locked)
            HStack(spacing: Spacing.sm) {
                Text("Start:")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.appTextSecondary)
                Text("\(formatNumber(subtractiveStartWeight ?? 0)) \(scaleReading?.unit.rawValue ?? "g")")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.appTextSecondary)
                Image(systemName: "lock.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.appSuccess)
            }

            // Current weight (live)
            if let reading = scaleReading {
                HStack(spacing: Spacing.sm) {
                    Text("Now:")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appTextSecondary)
                    Text(reading.display)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color.appTextSecondary)
                        .contentTransition(.numericText())
                        .animation(.easeOut(duration: 0.15), value: reading.display)
                }
            }

            // Delta (hero-sized)
            if let delta = subtractiveDelta {
                Text("\u{0394} Food: \(formatNumber(delta)) \(scaleReading?.unit.rawValue ?? "g")")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appTint)
                    .contentTransition(.numericText())
                    .animation(.easeOut(duration: 0.15), value: delta)

                // Macro preview based on delta
                if let macros = scaledMacrosForValue(delta, unit: scaleReading?.unit) {
                    macroDashboard(cal: macros.calories, protein: macros.proteinG,
                                   carbs: macros.carbsG, fat: macros.fatG)
                }
            }

            // Action buttons
            HStack(spacing: Spacing.sm) {
                Button {
                    onConfirmSubtractive?()
                } label: {
                    HStack(spacing: Spacing.sm) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 13))
                        Text("Lock in \(formatNumber(subtractiveDelta ?? 0)) \(scaleReading?.unit.rawValue ?? "g")")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.sm)
                    .frame(maxWidth: .infinity)
                    .background((subtractiveDelta ?? 0) > 0 ? Color.appTint : Color.appTint.opacity(0.4))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled((subtractiveDelta ?? 0) <= 0)

                Button {
                    onCancelSubtractive?()
                } label: {
                    Text("Cancel")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.appTextSecondary)
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Fallback for non-weight units or no scale — shows base serving macros with prompt to confirm quantity.
    private var manualQuantityContent: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            // Name + source
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(2)

                Spacer()
                sourceIcon
            }

            // Quantity (tap to edit) with unconfirmed indicator
            HStack(spacing: Spacing.sm) {
                Text("\(formatNumber(item.quantity, decimals: decimalsForUnit(item.unit))) \(item.unit)")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.appTextSecondary)

                Text("· Confirm qty")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.appTint)
                    .opacity(confirmQtyPulse)
            }
            .contentShape(Rectangle())
            .onTapGesture { onStartEdit?() }
            .onAppear {
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    confirmQtyPulse = 0.5
                }
            }

            // Macro dashboard (shows base serving macros)
            macroDashboard(
                cal: item.calories, protein: item.proteinG,
                carbs: item.carbsG, fat: item.fatG
            )

            // Action bar
            heroActionBar
        }
        .contentShape(Rectangle())
        .onTapGesture { onStartEdit?() }
    }

    /// Compute scaled macros from a scale reading using base serving data.
    private func scaledMacrosForReading(_ reading: ScaleReading) -> Macros? {
        guard let baseMacros = item.baseMacros,
              let baseSize = item.baseServingSize,
              baseSize > 0 else { return nil }
        let baseUnit = item.baseServingUnit ?? "g"
        let readingUnit = reading.unit.rawValue
        var readingInBaseUnit = reading.value
        if readingUnit != baseUnit,
           let fromG = weightRatiosG[readingUnit],
           let toG = weightRatiosG[baseUnit] {
            readingInBaseUnit = reading.value * fromG / toG
        }
        let scale = readingInBaseUnit / baseSize
        return Macros(
            calories: baseMacros.calories * scale,
            proteinG: baseMacros.proteinG * scale,
            carbsG:   baseMacros.carbsG   * scale,
            fatG:     baseMacros.fatG     * scale)
    }

    /// Scale macros for a raw weight value (used by subtractive mode).
    private func scaledMacrosForValue(_ value: Double, unit: ScaleUnit?) -> Macros? {
        guard let baseMacros = item.baseMacros,
              let baseSize = item.baseServingSize,
              baseSize > 0 else { return nil }
        let baseUnit = item.baseServingUnit ?? "g"
        let readingUnit = unit?.rawValue ?? "g"
        var valueInBaseUnit = value
        if readingUnit != baseUnit,
           let fromG = weightRatiosG[readingUnit],
           let toG = weightRatiosG[baseUnit] {
            valueInBaseUnit = value * fromG / toG
        }
        let scale = valueInBaseUnit / baseSize
        return Macros(
            calories: baseMacros.calories * scale,
            proteinG: baseMacros.proteinG * scale,
            carbsG:   baseMacros.carbsG   * scale,
            fatG:     baseMacros.fatG     * scale)
    }

    private func dashedMacroChip(_ label: String, _ value: String) -> some View {
        HStack(spacing: 2) {
            Text(value)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.appTextTertiary)
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Color.appTextTertiary)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, 4)
        .background(Color.appSurfaceSecondary.opacity(0.5))
        .clipShape(Capsule())
    }

    // MARK: - Compact Normal Card (matches FoodEntryRow layout)

    private var compactNormalContent: some View {
        HStack(spacing: Spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: Spacing.xs) {
                    Text(item.name)
                        .font(.appBody)
                        .fontWeight(.regular)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)
                        .layoutPriority(1)

                    Text("\u{00B7}")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)

                    Text("\(formatNumber(item.quantity, decimals: decimalsForUnit(item.unit))) \(item.unit)")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                        .lineLimit(1)
                }

                HStack(spacing: Spacing.xs) {
                    Image(systemName: FoodSourceIndicator.systemImage(for: item.source))
                        .font(.system(size: 12))
                        .foregroundStyle(FoodSourceIndicator.accentColor(for: item.source))

                    if item.confirmedViaScale {
                        Image(systemName: "scalemass.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.appTint)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            MacroNutrientsColumn(macros: Macros(
                calories: item.calories,
                proteinG: item.proteinG,
                carbsG: item.carbsG,
                fatG: item.fatG))
        }
        .padding(.vertical, Spacing.md)
        .contentShape(Rectangle())
        .onTapGesture { onTapToExpand?() }
    }

    // MARK: - Pending Card

    private var pendingContent: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(2)

                Spacer()

                ProgressView()
                    .controlSize(.small)
            }

            Text("Looking up\u{2026}")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            // Placeholder dashboard
            creatingMacroDashboard(progress: nil)
        }
    }

    // MARK: - Disambiguate Card

    private var disambiguateContent: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(2)

                Spacer()

                Image(systemName: "questionmark.circle")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.appTint)
            }

            Text("Which one did you mean?")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            if let options = item.disambiguationOptions {
                VStack(spacing: Spacing.sm) {
                    ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                        Button {
                            if let directSelect = onSelectDisambiguateOption {
                                directSelect(option)
                            } else {
                                onSendTranscript?("\(index + 1)")
                            }
                        } label: {
                            Text(option.label)
                                .font(.system(size: 14, weight: .semibold))
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, Spacing.sm)
                                .padding(.horizontal, Spacing.md)
                        }
                        .buttonStyle(GlassButtonStyle(color: Color.appTint))
                    }
                }
            }
        }
    }

    // MARK: - Choice Card (not found)

    private var choiceContent: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(2)

                Spacer()

                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.appWarning)
            }

            Text("Not found in your foods")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            VStack(spacing: Spacing.sm) {
                Button {
                    onSendTranscript?("create it")
                } label: {
                    Text("Create new food")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .padding(.horizontal, Spacing.md)
                }
                .buttonStyle(GlassButtonStyle(color: Color.appTint))

                Button {
                    onSendTranscript?("try USDA")
                } label: {
                    Text("Try USDA (less reliable)")
                        .font(.system(size: 14))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .padding(.horizontal, Spacing.md)
                }
                .buttonStyle(GlassButtonStyle(color: Color.appTextSecondary))

                Button {
                    onSendTranscript?("never mind")
                } label: {
                    Text("Never mind")
                        .font(.system(size: 14))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.sm)
                        .padding(.horizontal, Spacing.md)
                }
                .buttonStyle(GlassButtonStyle(color: Color.appTextSecondary))

                if onSearchManually != nil {
                    Button {
                        onSearchManually?(item.name)
                    } label: {
                        Text("Search manually")
                            .font(.system(size: 14))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.sm)
                            .padding(.horizontal, Spacing.md)
                    }
                    .buttonStyle(GlassButtonStyle(color: Color.appTextSecondary))
                }
            }
        }
    }

    // MARK: - Creating Card (progressive field fill — hero layout)

    private var creatingContent: some View {
        let progress = item.creatingProgress
        return VStack(alignment: .leading, spacing: Spacing.lg) {
            // Name + spinner (mirrors hero header)
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(2)

                Spacer()

                ProgressView()
                    .controlSize(.small)
            }

            // Current field prompt + serving size
            VStack(alignment: .leading, spacing: Spacing.xs) {
                if let progress {
                    Text(creatingFieldLabel(progress.currentField))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.appTint)
                        .transition(.opacity)
                        .id(progress.currentField)
                }

                if let progress, let size = progress.servingSize, let unit = progress.servingUnit {
                    Text("\(formatNumber(size, decimals: size.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 1)) \(unit)")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Color.appTextSecondary)
                        .transition(.opacity.combined(with: .move(edge: .leading)))
                }
            }

            // Macro dashboard — values fill in progressively, empty slots show "—"
            creatingMacroDashboard(progress: progress)
                .animation(.easeOut(duration: 0.25), value: progress?.calories)
                .animation(.easeOut(duration: 0.25), value: progress?.proteinG)
                .animation(.easeOut(duration: 0.25), value: progress?.carbsG)
                .animation(.easeOut(duration: 0.25), value: progress?.fatG)

            // Action bar
            Button {
                initNutritionFormFields()
                isManualNutritionMode = true
                onStartEdit?()
            } label: {
                Label("Fill in manually", systemImage: "pencil")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(KitchenTheme.cardBorder, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    /// Macro dashboard for creating state — collected values show as numbers, uncollected as "—".
    private func creatingMacroDashboard(progress: CreatingFoodProgress?) -> some View {
        HStack(spacing: 0) {
            creatingDashboardColumn(value: progress?.calories, label: "Cal", color: Color.caloriesAccent, isCal: true)
            creatingDashboardColumn(value: progress?.proteinG, label: "Protein", color: Color.proteinAccent)
            creatingDashboardColumn(value: progress?.carbsG, label: "Carbs", color: Color.carbsAccent)
            creatingDashboardColumn(value: progress?.fatG, label: "Fat", color: Color.fatAccent)
        }
    }

    private func creatingDashboardColumn(value: Double?, label: String, color: Color, isCal: Bool = false) -> some View {
        VStack(spacing: 4) {
            if let v = value {
                Text(isCal ? "\(Int(v.rounded()))" : String(format: "%.1fg", v))
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appText)
            } else {
                Text("—")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.appTextTertiary)
            }

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            RoundedRectangle(cornerRadius: 2)
                .fill(value != nil ? color : color.opacity(0.25))
                .frame(height: 3)
                .padding(.horizontal, Spacing.sm)
        }
        .frame(maxWidth: .infinity)
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

    // MARK: - Shared Sub-views

    /// Scale factor from the edited quantity relative to base serving.
    /// Uses conversion data when the unit differs from the item's stored unit.
    private var editScaleFactor: Double {
        guard let editQty = Double(editQuantityText), editQty > 0 else { return 1 }
        // Use base macro data if available for accurate conversion
        if let baseSize = item.baseServingSize, baseSize > 0 {
            let baseUnit = item.baseServingUnit ?? item.unit
            let qtyInBase = convertQuantityToBaseUnit(editQty, from: editUnit, baseUnit: baseUnit)
            return qtyInBase / baseSize
        }
        // Fallback: simple ratio from stored quantity
        guard item.quantity > 0 else { return 1 }
        return editQty / item.quantity
    }

    /// Convert a quantity from one unit to the base serving unit using ratio tables and conversions.
    private func convertQuantityToBaseUnit(_ qty: Double, from unit: String, baseUnit: String) -> Double {
        if unit == baseUnit { return qty }
        if unit == "servings", let baseSize = item.baseServingSize {
            return qty * baseSize
        }
        // Check saved conversions
        if let conv = item.conversions.first(where: { $0.unitName == unit }),
           let baseSize = item.baseServingSize, baseSize > 0 {
            return qty * conv.quantityInBaseServings * baseSize
        }
        // Same-system ratio table conversion
        if let fromG = weightRatiosG[unit], let toG = weightRatiosG[baseUnit] {
            return qty * fromG / toG
        }
        if let fromMl = volumeRatiosMl[unit], let toMl = volumeRatiosMl[baseUnit] {
            return qty * fromMl / toMl
        }
        return qty
    }

    @ViewBuilder
    private var sourceIcon: some View {
        Image(systemName: FoodSourceIndicator.systemImage(for: item.source))
            .font(.system(size: 14))
            .foregroundStyle(FoodSourceIndicator.accentColor(for: item.source))
    }

    // MARK: - Inline Quantity Editor

    private var inlineQuantityEditor: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            // Header
            HStack {
                Text(item.name)
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Color.appText)
                    .lineLimit(1)

                Spacer()

                HStack(spacing: Spacing.xs) {
                    if item.isAssumed == true {
                        Text("\u{2726}assumed")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.appTextTertiary)
                    }
                    sourceIcon
                }
            }

            // Editable quantity + unit
            HStack(spacing: Spacing.sm) {
                TextField("0", text: $editQuantityText)
                    .keyboardType(.decimalPad)
                    .focused($quantityFieldFocused)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
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
                            .font(.system(size: 17, weight: .medium))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                }

                // Scale button — switch from manual to scale weighing
                if isScaleConnected && itemHasWeightUnit {
                    Button {
                        onReweigh?()
                    } label: {
                        Image(systemName: "scalemass.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.appTint)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.sm)
                            .background(Color.appTint.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    }
                    .buttonStyle(.plain)
                }
            }

            // Live-scaled macro dashboard
            liveMacroDashboard

            // Actions
            HStack {
                Button(role: .destructive) {
                    onRemove?()
                } label: {
                    Label("Remove", systemImage: "trash")
                        .font(.system(size: 14))
                }
                .foregroundStyle(Color.appDestructive)

                Spacer()

                Button {
                    onEndEdit?()
                } label: {
                    Text("Done")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.appText)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                        .background(Color.appTint)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity)
    }

    /// Macro dashboard that scales live based on the edited quantity.
    private var liveMacroDashboard: some View {
        let scale = editScaleFactor
        return macroDashboard(
            cal: item.calories * scale,
            protein: item.proteinG * scale,
            carbs: item.carbsG * scale,
            fat: item.fatG * scale
        )
        .animation(.easeOut(duration: 0.15), value: editQuantityText)
    }

    // MARK: - Inline Nutrition Form (hero layout)

    private var inlineNutritionForm: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            // Name (editable, hero-sized)
            TextField("Food name", text: $editName)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color.appText)

            // Serving size + unit
            HStack(spacing: Spacing.sm) {
                TextField("100", text: $editServingSize)
                    .keyboardType(.decimalPad)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.appText)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .frame(maxWidth: 100)

                TextField("g", text: $editServingUnit)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Color.appTextSecondary)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.sm)
                    .background(KitchenTheme.fieldBackground)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    .frame(maxWidth: 80)
            }

            // Macro dashboard with editable fields
            nutritionFormDashboard

            // Action bar
            HStack {
                Button(role: .destructive) {
                    onEndEdit?()
                    onRemove?()
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.appDestructive)
                        .padding(Spacing.sm)
                        .background(KitchenTheme.fieldBackground)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(KitchenTheme.cardBorder, lineWidth: 1))
                }
                .buttonStyle(.plain)

                Spacer()

                Button {
                    submitNutritionForm()
                } label: {
                    Label("Add Food", systemImage: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                        .background(isNutritionFormValid ? Color.appTint : Color.appTint.opacity(0.3))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!isNutritionFormValid)
            }
        }
        .transition(.opacity)
    }

    /// Editable macro dashboard for the nutrition form — mirrors the hero dashboard layout
    /// but with text fields instead of static values.
    private var nutritionFormDashboard: some View {
        HStack(spacing: 0) {
            nutritionFormColumn(label: "Cal", text: $editCalories, color: Color.caloriesAccent, unit: "kcal")
            nutritionFormColumn(label: "Protein", text: $editProtein, color: Color.proteinAccent, unit: "g")
            nutritionFormColumn(label: "Carbs", text: $editCarbs, color: Color.carbsAccent, unit: "g")
            nutritionFormColumn(label: "Fat", text: $editFat, color: Color.fatAccent, unit: "g")
        }
    }

    private func nutritionFormColumn(label: String, text: Binding<String>, color: Color, unit: String) -> some View {
        VStack(spacing: 4) {
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(Color.appText)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.appTextSecondary)

            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(height: 3)
                .padding(.horizontal, Spacing.sm)
        }
        .frame(maxWidth: .infinity)
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
        var opts = availableUnits
        if !opts.contains(item.unit) { opts.insert(item.unit, at: 0) }
        return opts
    }

    // MARK: - Flash Animation

    private func fireFlash(_ binding: Binding<CGFloat>) {
        withAnimation(.spring(response: 0.15, dampingFraction: 0.4)) {
            binding.wrappedValue = 1.25
        }
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

    private func decimalsForUnit(_ unit: String) -> Int {
        unit == "oz" ? 1 : 0
    }
}

// MARK: - GlassMacroChip

private struct GlassMacroChip: View {
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
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color.appText)
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

// MARK: - GlassPlaceholderChip

private struct GlassPlaceholderChip: View {
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 3) {
            Circle()
                .fill(color.opacity(0.3))
                .frame(width: 5, height: 5)

            Text("— \(label)")
                .font(.system(size: 12))
                .foregroundStyle(Color.appTextTertiary)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, 2)
        .background(Color.gray.opacity(0.05))
        .clipShape(Capsule())
    }
}

// MARK: - GlassButtonStyle

/// Outlined pill button for dark glassmorphic UI.
private struct GlassButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? .white : color)
            .padding(.vertical, Spacing.xs)
            .padding(.horizontal, Spacing.sm)
            .frame(maxWidth: .infinity)
            .background(
                configuration.isPressed ? color.opacity(0.3) : Color.white.opacity(0.04)
            )
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(color.opacity(0.5), lineWidth: 1)
            )
    }
}

// MARK: - Preview

#Preview("Hero (normal)") {
    ZStack {
        Color.appBackground.ignoresSafeArea()

        DraftMealCard(
            item: DraftItem(
                id: "1", name: "Chicken Breast", quantity: 150, unit: "g",
                calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
                source: .database, mealLabel: .lunch, state: .normal,
                quantityConfirmed: true),
            isHero: true,
            isEditing: false,
            heroMinHeight: 300
        )
        .padding()
    }
}

#Preview("Compact (normal)") {
    ZStack {
        Color.appBackground.ignoresSafeArea()

        DraftMealCard(
            item: DraftItem(
                id: "2", name: "Brown Rice", quantity: 80, unit: "g",
                calories: 88, proteinG: 2, carbsG: 18.4, fatG: 0.7,
                source: .custom, mealLabel: .lunch, state: .normal,
                quantityConfirmed: true),
            isHero: false,
            isEditing: false
        )
        .padding()
    }
}

#Preview("Hero (editing)") {
    ZStack {
        Color.appBackground.ignoresSafeArea()

        DraftMealCard(
            item: DraftItem(
                id: "3", name: "Chicken Breast", quantity: 100, unit: "g",
                calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6,
                source: .database, mealLabel: .lunch, state: .normal,
                quantityConfirmed: true),
            isHero: true,
            isEditing: true,
            heroMinHeight: 300
        )
        .padding()
    }
}

#Preview("Pending") {
    ZStack {
        Color.appBackground.ignoresSafeArea()

        DraftMealCard(
            item: DraftItem(
                id: "3", name: "Salmon", quantity: 1, unit: "servings",
                calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
                source: .database, mealLabel: .dinner, state: .pending),
            isHero: true,
            isEditing: false
        )
        .padding()
    }
}

#Preview("Creating (mid-fill)") {
    ZStack {
        Color.appBackground.ignoresSafeArea()

        DraftMealCard(
            item: DraftItem(
                id: "5", name: "Acai Bowl", quantity: 1, unit: "servings",
                calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
                source: .custom, mealLabel: .lunch, state: .creating,
                creatingProgress: CreatingFoodProgress(
                    servingSize: 100, servingUnit: "g",
                    calories: 200, proteinG: nil, carbsG: nil, fatG: nil,
                    currentField: .protein)),
            isHero: true,
            isEditing: false
        )
        .padding()
    }
}

#Preview("Disambiguate") {
    ZStack {
        Color.appBackground.ignoresSafeArea()

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
            isHero: true,
            isEditing: false
        )
        .padding()
    }
}
