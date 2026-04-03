import SwiftUI

// MARK: - GoalsGuidedView

/// 3-step wizard for guided goal setup.
/// Step 0: Profile check. Step 1: Goal type + aggressiveness. Step 2: Review & adjust macros.
/// Always lives inside GoalsView's NavigationStack.
struct GoalsGuidedView: View {
    @Environment(ProfileStore.self) private var profileStore
    @Environment(GoalStore.self)    private var goalStore
    @Environment(DateStore.self)    private var dateStore
    @Environment(\.dismiss)         private var dismiss

    // MARK: Wizard state

    @State private var step:              Int               = 0
    @State private var goalType:          GoalType          = .cut
    @State private var aggressiveness:    GoalAggressiveness = .standard
    @State private var calories:          String            = ""
    @State private var protein:           String            = ""
    @State private var carbs:             String            = ""
    @State private var fat:               String            = ""
    @State private var isSaving:          Bool              = false
    @State private var showHealthProfile: Bool              = false

    // MARK: Derived

    private var selectedDate: String { dateStore.selectedDate }

    private var canCompute: Bool {
        guard let p = profileStore.profile else { return false }
        return p.heightCm != nil && p.weightKg != nil && p.activityLevel != nil
    }

    private var nextDisabled: Bool {
        step == 0 && profileStore.profile == nil
    }

    private var canSave: Bool {
        parsePositiveNumber(calories) != nil &&
        parsePositiveNumber(protein)  != nil &&
        parsePositiveNumber(carbs)    != nil &&
        parsePositiveNumber(fat)      != nil
    }

    // MARK: Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                stepContent
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.xl)
            .padding(.bottom, Spacing.xl)
        }
        .background(Color.appBackground)
        .navigationTitle("Guided Goals")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            footer
        }
        .task {
            if profileStore.profile == nil {
                await profileStore.fetch()
            }
            estimateMacros()
        }
        .onChange(of: profileStore.profile?.heightCm)     { _, _ in estimateMacros() }
        .onChange(of: profileStore.profile?.weightKg)     { _, _ in estimateMacros() }
        .onChange(of: profileStore.profile?.activityLevel) { _, _ in estimateMacros() }
        .onChange(of: goalType)        { _, _ in estimateMacros() }
        .onChange(of: aggressiveness)  { _, _ in estimateMacros() }
        .navigationDestination(isPresented: $showHealthProfile) {
            HealthProfileView()
        }
    }

    // MARK: Step content

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case 0:  step0
        case 1:  step1
        default: step2
        }
    }

    // MARK: Step 0 — Profile check

    private var step0: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Check your profile")
                .font(.appHeadline)
                .tracking(Typography.Tracking.headline)
                .foregroundStyle(Color.appText)

            Text("We use your height, weight, sex, age (if set), and activity level to estimate a starting point.")
                .font(.appBody)
                .tracking(Typography.Tracking.body)
                .foregroundStyle(Color.appTextSecondary)

            // Stats card
            VStack(alignment: .leading, spacing: Spacing.sm) {
                if profileStore.isLoading && profileStore.profile == nil {
                    ProgressView()
                        .tint(Color.appTint)
                } else if let p = profileStore.profile {
                    Text("Your current stats")
                        .font(.appSubhead)
                        .tracking(Typography.Tracking.subhead)
                        .foregroundStyle(Color.appText)
                    statRow("Height",   value: heightDisplayText(p))
                    statRow("Weight",   value: weightDisplayText(p))
                    statRow("Age",      value: ageDisplayText(p))
                    statRow("Activity", value: activityDisplayText(p))
                } else {
                    Text("No profile yet. Add height, weight, and activity level on the Profile tab for better suggestions.")
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .foregroundStyle(Color.appTextSecondary)
                }

                Button {
                    showHealthProfile = true
                } label: {
                    Text("Edit health details")
                        .font(.appFootnote)
                        .foregroundStyle(Color.appTint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.xs)
                }
                .buttonStyle(.plain)
                .padding(.top, Spacing.md)
            }
            .padding(Spacing.lg)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))

            if !canCompute {
                Text("Suggestions work best when height, weight, and activity are set. You can still continue and enter targets manually.")
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(Color.appWarning)
            }
        }
    }

    // MARK: Step 1 — Choose your goal

    private var step1: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Choose your goal")
                .font(.appHeadline)
                .tracking(Typography.Tracking.headline)
                .foregroundStyle(Color.appText)

            Text("Pick what you're aiming for right now.")
                .font(.appBody)
                .tracking(Typography.Tracking.body)
                .foregroundStyle(Color.appTextSecondary)

            // Goal type cards
            VStack(spacing: Spacing.sm) {
                goalTypeCard("Lose fat",     value: .cut,      desc: "Calorie deficit for fat loss")
                goalTypeCard("Maintain",     value: .maintain, desc: "Stay around current weight")
                goalTypeCard("Gain muscle",  value: .gain,     desc: "Small surplus for lean gains")
            }
            .padding(.top, Spacing.sm)

            // Aggressiveness
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Aggressiveness")
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
                    .foregroundStyle(Color.appText)

                Text("Rough weekly rate estimates assume average training and adherence.")
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(Color.appTextSecondary)

                PillFlowLayout(spacing: Spacing.xs) {
                    aggressivenessPill(.mild,       label: mildLabel)
                    aggressivenessPill(.standard,   label: standardLabel)
                    aggressivenessPill(.aggressive, label: aggressiveLabel)
                }
            }
            .padding(.top, Spacing.lg)
        }
    }

    // MARK: Step 2 — Review & adjust

    private var step2: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Review & adjust targets")
                .font(.appHeadline)
                .tracking(Typography.Tracking.headline)
                .foregroundStyle(Color.appText)

            Text("Suggestions based on your stats and goal. Tweak any value, then save.")
                .font(.appBody)
                .tracking(Typography.Tracking.body)
                .foregroundStyle(Color.appTextSecondary)

            VStack(spacing: Spacing.md) {
                goalField(label: "Calories", placeholder: "e.g. 2000",
                          value: $calories, unit: "kcal", accentColor: .caloriesAccent)
                Divider().padding(.leading, Spacing.lg)
                goalField(label: "Protein",  placeholder: "e.g. 150",
                          value: $protein,  unit: "g",    accentColor: .proteinAccent)
                Divider().padding(.leading, Spacing.lg)
                goalField(label: "Carbs",    placeholder: "e.g. 200",
                          value: $carbs,    unit: "g",    accentColor: .carbsAccent)
                Divider().padding(.leading, Spacing.lg)
                goalField(label: "Fat",      placeholder: "e.g. 65",
                          value: $fat,      unit: "g",    accentColor: .fatAccent)
            }
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            .padding(.top, Spacing.sm)
        }
    }

    // MARK: Footer

    private var footer: some View {
        VStack(spacing: Spacing.md) {
            // Step dots
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(i == step ? Color.appTint : Color.appTextTertiary)
                        .opacity(i == step ? 1.0 : 0.4)
                        .frame(width: 6, height: 6)
                }
            }
            .frame(maxWidth: .infinity)

            // Back / Next or Save
            HStack(spacing: Spacing.md) {
                Button {
                    if step > 0 { step -= 1 }
                } label: {
                    Text("Back")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appTextSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                }
                .buttonStyle(.plain)
                .disabled(step == 0)
                .opacity(step == 0 ? 0.5 : 1.0)

                if step < 2 {
                    Button {
                        if step < 2 { step += 1 }
                    } label: {
                        Text("Next")
                            .font(.appSubhead)
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.md)
                            .background(nextDisabled ? Color.appTextTertiary : Color.appTint)
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    }
                    .buttonStyle(.plain)
                    .disabled(nextDisabled)
                } else {
                    Button {
                        Task { await saveFinal() }
                    } label: {
                        Group {
                            if isSaving {
                                ProgressView().tint(.white)
                            } else {
                                Text("Save goals")
                                    .font(.appSubhead)
                                    .fontWeight(.semibold)
                            }
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(canSave ? Color.appTint : Color.appTextTertiary)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSave || isSaving)
                }
            }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.top, Spacing.md)
        .padding(.bottom, Spacing.lg)
        .background(Color.appBackground)
        .overlay(alignment: .top) { Divider() }
    }

    // MARK: Card / pill helpers

    @ViewBuilder
    private func goalTypeCard(_ label: String, value: GoalType, desc: String) -> some View {
        let selected = goalType == value
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.appSubhead)
                .foregroundStyle(selected ? Color.appTint : Color.appText)
            Text(desc)
                .font(.appFootnote)
                .foregroundStyle(Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.md)
        .background(selected ? Color.appTint.opacity(0.12) : Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: BorderRadius.lg)
                .stroke(selected ? Color.appTint : Color.appBorderLight, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .onTapGesture { goalType = value }
    }

    @ViewBuilder
    private func aggressivenessPill(_ value: GoalAggressiveness, label: String) -> some View {
        let selected = aggressiveness == value
        Text(label)
            .font(.appCaption1)
            .fontWeight(selected ? .semibold : .regular)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(selected ? Color.white : Color.appTextSecondary)
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, Spacing.xs)
            .background(selected ? Color.appTint : Color.appSurfaceSecondary)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(selected ? Color.appTint : Color.appBorder, lineWidth: 1))
            .contentShape(Capsule())
            .onTapGesture { aggressiveness = value }
    }

    // MARK: Goal field (verbatim from GoalsEditView)

    @ViewBuilder
    private func goalField(
        label: String,
        placeholder: String,
        value: Binding<String>,
        unit: String,
        accentColor: Color
    ) -> some View {
        HStack(spacing: Spacing.md) {
            Circle()
                .fill(accentColor.opacity(0.2))
                .frame(width: 10, height: 10)

            Text(label)
                .font(.appBody)
                .foregroundStyle(Color.appText)
                .frame(width: 80, alignment: .leading)

            TextField(placeholder, text: value)
                .keyboardType(.decimalPad)
                .font(.appBody)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(Color.appText)

            Text(unit)
                .font(.appFootnote)
                .foregroundStyle(Color.appTextTertiary)
                .frame(width: 32, alignment: .trailing)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    // MARK: Stat row helper

    @ViewBuilder
    private func statRow(_ label: String, value: String) -> some View {
        Text("\(label): \(value)")
            .font(.appFootnote)
            .tracking(Typography.Tracking.footnote)
            .foregroundStyle(Color.appTextSecondary)
    }

    // MARK: Aggressiveness label computed properties

    private var mildLabel: String {
        switch goalType {
        case .gain:     return "Mild (+0.25 lb/wk)"
        case .maintain: return "Tight range"
        case .cut:      return "Mild (~0.5 lb/wk)"
        }
    }

    private var standardLabel: String {
        switch goalType {
        case .gain:     return "Standard (+0.5 lb/wk)"
        case .maintain: return "Maintenance"
        case .cut:      return "Standard (~0.75 lb/wk)"
        }
    }

    private var aggressiveLabel: String {
        switch goalType {
        case .gain:     return "Aggressive (+0.75 lb/wk)"
        case .maintain: return "Loose range"
        case .cut:      return "Aggressive (~1 lb/wk)"
        }
    }

    // MARK: Profile display helpers

    private func heightDisplayText(_ p: UserProfile) -> String {
        guard let h = p.heightCm else { return "Not set" }
        return p.preferredUnits == .imperial
            ? "\(Int((h / 2.54).rounded())) in"
            : "\(Int(h.rounded())) cm"
    }

    private func weightDisplayText(_ p: UserProfile) -> String {
        guard let w = p.weightKg else { return "Not set" }
        return p.preferredUnits == .imperial
            ? "\(Int((w / 0.45359237).rounded())) lb"
            : "\(Int(w.rounded())) kg"
    }

    private func ageDisplayText(_ p: UserProfile) -> String {
        if let age = p.ageYears { return "\(age)" }
        if let dob = p.dateOfBirth, let age = MacroCalculator.ageFromDateOfBirth(iso: dob) { return "\(age)" }
        return "Not set"
    }

    private func activityDisplayText(_ p: UserProfile) -> String {
        switch p.activityLevel {
        case .sedentary: return "Sedentary"
        case .light:     return "Light"
        case .moderate:  return "Moderate"
        case .high:      return "High"
        case .veryHigh:  return "Very high"
        case .none:      return "Not set"
        }
    }

    // MARK: Estimation

    private func estimateMacros() {
        guard let p = profileStore.profile,
              let weightKg      = p.weightKg,
              let heightCm      = p.heightCm,
              let activityLevel = p.activityLevel else { return }

        let ageInt = p.ageYears
            ?? p.dateOfBirth.flatMap { MacroCalculator.ageFromDateOfBirth(iso: $0) }
            ?? 30

        let result = MacroCalculator.estimate(
            weightKg:       weightKg,
            heightCm:       heightCm,
            ageYears:       ageInt,
            sex:            p.sex,
            activityLevel:  activityLevel,
            goalType:       goalType,
            aggressiveness: aggressiveness
        )

        calories = String(result.calories)
        protein  = String(result.proteinG)
        carbs    = String(result.carbsG)
        fat      = String(result.fatG)
    }

    private func parsePositiveNumber(_ s: String) -> Double? {
        guard let n = Double(s), n.isFinite, n > 0 else { return nil }
        return n
    }

    // MARK: Save

    private func saveFinal() async {
        guard
            let cal = parsePositiveNumber(calories),
            let pro = parsePositiveNumber(protein),
            let car = parsePositiveNumber(carbs),
            let f   = parsePositiveNumber(fat)
        else { return }

        isSaving = true
        await goalStore.saveChange(data: UpdateGoalsForDateRequest(
            effectiveDate:  selectedDate,
            macros:         Macros(calories: cal, proteinG: pro, carbsG: car, fatG: f),
            goalType:       goalType,
            aggressiveness: aggressiveness,
            profileId:      nil,
            newProfileName: nil
        ))
        isSaving = false

        UINotificationFeedbackGenerator().notificationOccurred(.success)
        dismiss()
    }
}

// MARK: - PillFlowLayout

/// Left-aligned wrapping row layout — equivalent to CSS/RN `flexDirection: row, flexWrap: wrap`.
private struct PillFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.replacingUnspecifiedDimensions().width
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                y += lineHeight + spacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                y += lineHeight + spacing
                x = bounds.minX
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        GoalsGuidedView()
            .environment(ProfileStore.shared)
            .environment(GoalStore.shared)
            .environment(DateStore.shared)
    }
}
