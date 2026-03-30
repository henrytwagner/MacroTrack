import SwiftUI

// MARK: - SettingsRow

private struct SettingsRow: View {
    let icon:     String
    let label:    String
    let subtitle: String?
    let onPress:  () -> Void

    init(icon: String, label: String, subtitle: String? = nil, onPress: @escaping () -> Void) {
        self.icon     = icon
        self.label    = label
        self.subtitle = subtitle
        self.onPress  = onPress
    }

    var body: some View {
        Button {
            onPress()
        } label: {
            HStack(spacing: Spacing.md) {
                // Icon container
                ZStack {
                    RoundedRectangle(cornerRadius: BorderRadius.sm)
                        .fill(Color.appTint.opacity(0.18))
                        .frame(width: 36, height: 36)
                    Image(systemName: icon)
                        .font(.system(size: 18))
                        .foregroundStyle(Color.appTint)
                }

                // Label + optional subtitle
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                    if let subtitle {
                        Text(subtitle)
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.forward")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appTextTertiary)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Section separator (68pt left-inset, matching icon container)

private struct RowSeparator: View {
    var body: some View {
        Divider()
            .padding(.leading, 68)
    }
}

// MARK: - ProfileView

struct ProfileView: View {
    @Environment(AuthStore.self)       private var authStore
    @Environment(ProfileStore.self)    private var profileStore
    @Environment(AppearanceStore.self) private var appearanceStore

    @State private var unitSystem:        String = "METRIC"
    @State private var showGoalsStub:         Bool = false
    @State private var showHealthProfile:     Bool = false
    @State private var showFoodsStub:         Bool = false
    @State private var showBarcodeStub:       Bool = false
    @State private var showScaleStub:         Bool = false
    @State private var showCommunityFoodsStub: Bool = false
    @State private var showDeleteConfirmation: Bool = false

    private let appearanceModes: [(label: String, icon: String, value: String)] = [
        ("System", "iphone",       "system"),
        ("Light",  "sun.max",      "light"),
        ("Dark",   "moon",         "dark"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                pageTitle
                profileCard
                profileSection
                nutritionSection
                appearanceSection
                developmentSection
                accountSection
                aboutSection
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.sm)
            .padding(.bottom, 100)
        }
        .background(Color.appBackground)
        .task { await profileStore.fetch() }
        .onChange(of: profileStore.profile?.preferredUnits.rawValue) { _, newVal in
            unitSystem = newVal ?? "METRIC"
        }
        .sheet(isPresented: $showGoalsStub) {
            GoalsView()
                .environment(GoalStore.shared)
                .environment(DateStore.shared)
                .environment(ProfileStore.shared)
        }
        .sheet(isPresented: $showHealthProfile) {
            NavigationStack {
                HealthProfileView()
            }
            .environment(ProfileStore.shared)
        }
        .sheet(isPresented: $showFoodsStub)          { ManageCustomFoodsView() }
        .sheet(isPresented: $showBarcodeStub)        { stubSheet("Barcode Demo") }
        .sheet(isPresented: $showScaleStub)          { stubSheet("Scale Demo") }
        .sheet(isPresented: $showCommunityFoodsStub) { ManageCommunityFoodsView() }
    }

    // MARK: Sections

    private var pageTitle: some View {
        Text("Profile")
            .font(.appLargeTitle)
            .tracking(Typography.Tracking.largeTitle)
            .foregroundStyle(Color.appText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Spacing.sm)
            .padding(.bottom, Spacing.xs)
    }

    private var profileCard: some View {
        HStack(spacing: Spacing.lg) {
            ZStack {
                Circle()
                    .fill(Color.appTint.opacity(0.22))
                    .frame(width: 64, height: 64)
                Image(systemName: "person.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(Color.appTint)
            }

            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("My Profile")
                    .font(.appTitle3)
                    .tracking(Typography.Tracking.title3)
                    .foregroundStyle(Color.appText)
                Text("Health details and goals live in dedicated screens.")
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(Color.appTextSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private var profileSection: some View {
        sectionGroup(label: "PROFILE") {
            SettingsRow(icon: "person.circle", label: "Health profile",
                        subtitle: "Gender, height, weight, age, activity") {
                showHealthProfile = true
            }
        }
    }

    private var nutritionSection: some View {
        sectionGroup(label: "NUTRITION") {
            VStack(spacing: 0) {
                SettingsRow(icon: "flag", label: "Daily Goals",
                            subtitle: "Calories, protein, carbs, fat") {
                    showGoalsStub = true
                }
                RowSeparator()
                SettingsRow(icon: "fork.knife", label: "My Foods",
                            subtitle: "Manage custom foods") {
                    showFoodsStub = true
                }
                RowSeparator()
                SettingsRow(icon: "barcode", label: "Barcode demo",
                            subtitle: "Scan or enter barcode to look up product") {
                    showBarcodeStub = true
                }
                RowSeparator()
                SettingsRow(icon: "scalemass", label: "Scale demo",
                            subtitle: "Connect to Etekcity ESN00 smart scale") {
                    showScaleStub = true
                }
            }
        }
    }

    private var appearanceSection: some View {
        sectionGroup(label: "APPEARANCE") {
            VStack(spacing: 0) {
                // Theme picker
                HStack(spacing: Spacing.md) {
                    ZStack {
                        RoundedRectangle(cornerRadius: BorderRadius.sm)
                            .fill(Color.appTint.opacity(0.18))
                            .frame(width: 36, height: 36)
                        Image(systemName: "paintpalette")
                            .font(.system(size: 18))
                            .foregroundStyle(Color.appTint)
                    }

                    Text("Theme")
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: Spacing.xs) {
                        ForEach(appearanceModes, id: \.value) { opt in
                            pillButton(
                                isSelected: appearanceStore.mode == opt.value,
                                icon: opt.icon, label: opt.label
                            ) {
                                appearanceStore.mode = opt.value
                            }
                        }
                    }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)

                RowSeparator()

                // Units picker
                HStack(spacing: Spacing.md) {
                    ZStack {
                        RoundedRectangle(cornerRadius: BorderRadius.sm)
                            .fill(Color.appTint.opacity(0.18))
                            .frame(width: 36, height: 36)
                        Image(systemName: "chart.bar")
                            .font(.system(size: 18))
                            .foregroundStyle(Color.appTint)
                    }

                    Text("Units")
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: Spacing.xs) {
                        ForEach(["METRIC", "IMPERIAL"], id: \.self) { unit in
                            pillButton(
                                isSelected: unitSystem == unit,
                                icon: nil,
                                label: unit == "METRIC" ? "Metric" : "Imperial"
                            ) {
                                unitSystem = unit
                                if var profile = profileStore.profile {
                                    profile.preferredUnits = unit == "METRIC" ? .metric : .imperial
                                    Task { await profileStore.save(profile) }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)
            }
        }
    }

    private var developmentSection: some View {
        sectionGroup(label: "DEVELOPMENT") {
            SettingsRow(icon: "globe", label: "Community Foods",
                        subtitle: "Edit and delete community foods") {
                showCommunityFoodsStub = true
            }
        }
    }

    private var accountSection: some View {
        sectionGroup(label: "ACCOUNT") {
            VStack(spacing: 0) {
                SettingsRow(icon: "rectangle.portrait.and.arrow.right",
                            label: "Sign Out") {
                    authStore.signOut()
                }
                RowSeparator()
                SettingsRow(icon: "trash", label: "Delete Account",
                            subtitle: "Permanently remove all your data") {
                    showDeleteConfirmation = true
                }
            }
        }
        .alert("Delete Account?",
               isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task { await authStore.deleteAccount() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete your account and all associated data. This action cannot be undone.")
        }
    }

    private var aboutSection: some View {
        sectionGroup(label: "ABOUT") {
            HStack {
                Text("MacroTrack")
                    .font(.appBody)
                    .foregroundStyle(Color.appText)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
                    let build   = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "dev"
                    Text("v\(version)")
                        .font(.appBody)
                        .foregroundStyle(Color.appTextSecondary)
                    Text("Build \(build)")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
        }
    }

    // MARK: Helpers

    @ViewBuilder
    private func sectionGroup<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: Spacing.sm) {
            Text(label)
                .font(.appFootnote)
                .fontWeight(.semibold)
                .tracking(0.5)
                .foregroundStyle(Color.appTextSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Spacing.xs)

            VStack(spacing: 0) {
                content()
            }
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        }
    }

    @ViewBuilder
    private func pillButton(
        isSelected: Bool,
        icon: String?,
        label: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
        } label: {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 12))
                }
                Text(label)
                    .font(.appCaption1)
                    .fontWeight(isSelected ? .semibold : .regular)
                    .lineLimit(1)
                    .fixedSize()
            }
            .fixedSize()
            .foregroundStyle(isSelected ? Color.white : Color.appTextSecondary)
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, Spacing.xs)
            .background(isSelected ? Color.appTint : Color.appSurfaceSecondary)
            .clipShape(Capsule())
            .overlay(
                Capsule().stroke(isSelected ? Color.appTint : Color.appBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func stubSheet(_ title: String) -> some View {
        NavigationStack {
            Text("Coming in Phase C/D")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            showGoalsStub          = false
                            showHealthProfile      = false
                            showFoodsStub          = false
                            showBarcodeStub        = false
                            showScaleStub          = false
                            showCommunityFoodsStub = false
                        }
                    }
                }
        }
    }
}

// MARK: - Preview

#Preview {
    ProfileView()
        .environment(AuthStore.shared)
        .environment(ProfileStore.shared)
        .environment(AppearanceStore.shared)
}
