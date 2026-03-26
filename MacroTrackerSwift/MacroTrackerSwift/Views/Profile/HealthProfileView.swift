import SwiftUI

// MARK: - HealthProfileView

/// Health profile form: height, weight, date of birth, sex, activity level.
/// Navigation-context-agnostic — presented as a sheet (wrapped in NavigationStack)
/// from ProfileView, or pushed via navigationDestination from GoalsGuidedView.
struct HealthProfileView: View {
    @Environment(ProfileStore.self) private var profileStore
    @Environment(\.dismiss)         private var dismiss

    // MARK: Form state

    @State private var heightInput: String = ""
    @State private var weightInput: String = ""
    @State private var dateOfBirth: Date   = Self.defaultDOB
    @State private var hasDOB:      Bool   = false
    @State private var sex:         Sex    = .unspecified
    @State private var activity:    ActivityLevel? = nil
    @State private var isSaving:    Bool   = false

    // MARK: Derived

    private var unitSystem: UnitSystem { profileStore.profile?.preferredUnits ?? .metric }

    private var canSave: Bool {
        !heightInput.isEmpty && !weightInput.isEmpty && activity != nil && !isSaving
    }

    // MARK: Constants

    private static let defaultDOB: Date = {
        Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    }()

    private static let minDOB: Date = {
        var c = DateComponents(); c.year = 1900; c.month = 1; c.day = 1
        return Calendar.current.date(from: c) ?? Date(timeIntervalSince1970: -2208988800)
    }()

    private let activityDescriptions: [ActivityLevel: String] = [
        .sedentary: "Little or no exercise; mostly sitting (e.g., desk job, <5k steps/day).",
        .light:     "Light exercise 1–3 days/week or on your feet some of the day (~5–7k steps/day).",
        .moderate:  "Moderate exercise 3–5 days/week or active job (e.g., walking a lot, ~7–10k+ steps/day).",
        .high:      "Hard exercise most days or very active job (e.g., retail, restaurant, ~10–14k steps/day).",
        .veryHigh:  "Intense training or physically demanding work every day (e.g., manual labor, >14k steps/day).",
    ]

    // MARK: Body

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                // Subtitle
                Text("We use this info to suggest starting calorie and macro targets.")
                    .font(.appSubhead)
                    .tracking(Typography.Tracking.subhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                fieldsCard

                saveButton
            }
            .padding(Spacing.xl)
            .padding(.bottom, 100)
        }
        .background(Color.appBackground)
        .navigationTitle("Health Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.appTint)
                }
            }
        }
        .task {
            if profileStore.profile == nil {
                await profileStore.fetch()
            }
            populateFromProfile()
        }
        .onChange(of: profileStore.profile?.heightCm) { _, _ in populateFromProfile() }
        .onChange(of: profileStore.profile?.weightKg) { _, _ in populateFromProfile() }
    }

    // MARK: Fields card

    private var fieldsCard: some View {
        VStack(spacing: 0) {
            // Height
            fieldRow {
                Text("Height (\(unitSystem == .imperial ? "in" : "cm"))")
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                TextField(unitSystem == .imperial ? "70" : "178", text: $heightInput)
                    .keyboardType(.decimalPad)
                    .font(.appBody)
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.appText)
                    .frame(width: 80)
            }

            cardSeparator

            // Weight
            fieldRow {
                Text("Weight (\(unitSystem == .imperial ? "lb" : "kg"))")
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                TextField(unitSystem == .imperial ? "180" : "82", text: $weightInput)
                    .keyboardType(.decimalPad)
                    .font(.appBody)
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(Color.appText)
                    .frame(width: 80)
            }

            cardSeparator

            // Date of birth
            fieldRow {
                Text("Date of birth")
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if hasDOB {
                    DatePicker(
                        "",
                        selection: $dateOfBirth,
                        in: Self.minDOB...Date(),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                    .labelsHidden()
                } else {
                    Button("Select") {
                        hasDOB = true
                    }
                    .font(.appBody)
                    .foregroundStyle(Color.appTint)
                }
            }

            cardSeparator

            // Sex
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Sex")
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                HStack(spacing: Spacing.xs) {
                    sexPill(.male,        label: "Male")
                    sexPill(.female,      label: "Female")
                    sexPill(.unspecified, label: "Other")
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)

            cardSeparator

            // Activity level
            VStack(alignment: .leading, spacing: Spacing.sm) {
                Text("Activity level")
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                // Row 1
                HStack(spacing: Spacing.xs) {
                    activityPill(.sedentary, label: "Sedentary")
                    activityPill(.light,     label: "Light")
                    activityPill(.moderate,  label: "Moderate")
                }
                // Row 2
                HStack(spacing: Spacing.xs) {
                    activityPill(.high,     label: "High")
                    activityPill(.veryHigh, label: "Very high")
                }
                // Description
                if let selected = activity, let desc = activityDescriptions[selected] {
                    Text(desc)
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .foregroundStyle(Color.appTextSecondary)
                        .padding(.top, Spacing.xs)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
        }
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    // MARK: Save button

    private var saveButton: some View {
        Button {
            Task { await save() }
        } label: {
            Group {
                if isSaving {
                    ProgressView().tint(.white)
                } else {
                    Text("Save")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.lg)
            .background(canSave ? Color.appTint : Color.appTextTertiary)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        }
        .buttonStyle(.plain)
        .disabled(!canSave)
    }

    // MARK: Pill helpers

    @ViewBuilder
    private func sexPill(_ value: Sex, label: String) -> some View {
        let selected = sex == value
        Button {
            sex = value
        } label: {
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
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func activityPill(_ value: ActivityLevel, label: String) -> some View {
        let selected = activity == value
        Button {
            activity = value
        } label: {
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
        }
        .buttonStyle(.plain)
    }

    // MARK: Layout helpers

    @ViewBuilder
    private func fieldRow<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: Spacing.md) {
            content()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    private var cardSeparator: some View {
        Divider()
            .padding(.leading, Spacing.lg)
    }

    // MARK: Actions

    private func populateFromProfile() {
        guard let p = profileStore.profile else { return }
        sex      = p.sex
        activity = p.activityLevel
        if let dob = p.dateOfBirth, let parsed = isoToDate(dob) {
            dateOfBirth = parsed
            hasDOB = true
        }
        let units = p.preferredUnits
        if let h = p.heightCm {
            let display = units == .imperial ? h / 2.54 : h
            heightInput = String(Int(display.rounded()))
        }
        if let w = p.weightKg {
            let display = units == .imperial ? w / 0.45359237 : w
            weightInput = String(Int(display.rounded()))
        }
    }

    private func save() async {
        guard var updated = profileStore.profile else { return }
        let units = updated.preferredUnits
        if let raw = Double(heightInput), raw > 0 {
            updated.heightCm = units == .imperial ? raw * 2.54 : raw
        }
        if let raw = Double(weightInput), raw > 0 {
            updated.weightKg = units == .imperial ? raw * 0.45359237 : raw
        }
        updated.dateOfBirth   = hasDOB ? dateToISO(dateOfBirth) : updated.dateOfBirth
        updated.sex           = sex
        updated.activityLevel = activity

        isSaving = true
        await profileStore.save(updated)
        isSaving = false

        UINotificationFeedbackGenerator().notificationOccurred(.success)
        dismiss()
    }

    // MARK: ISO date helpers

    private func isoToDate(_ iso: String) -> Date? {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var comps = DateComponents()
        comps.year = parts[0]; comps.month = parts[1]; comps.day = parts[2]
        return Calendar.current.date(from: comps)
    }

    private func dateToISO(_ date: Date) -> String {
        let cal = Calendar.current
        let y   = cal.component(.year,  from: date)
        let m   = cal.component(.month, from: date)
        let d   = cal.component(.day,   from: date)
        return String(format: "%04d-%02d-%02d", y, m, d)
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        HealthProfileView()
            .environment(ProfileStore.shared)
    }
}
