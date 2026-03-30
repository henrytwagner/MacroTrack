import SwiftUI

// MARK: - AccountView

/// Account & profile information page, presented as a sheet from ProfileView.
struct AccountView: View {
    @Environment(AuthStore.self)    private var authStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(\.dismiss)         private var dismiss

    @State private var showHealthProfile:     Bool = false
    @State private var showDeleteConfirmation: Bool = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                avatarHeader
                infoSection
                healthSection
                accountSection
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.lg)
            .padding(.bottom, 100)
        }
        .background(Color.appBackground)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
        .sheet(isPresented: $showHealthProfile) {
            NavigationStack {
                HealthProfileView()
            }
            .environment(ProfileStore.shared)
        }
        .alert("Delete Account?",
               isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                Task {
                    await authStore.deleteAccount()
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete your account and all associated data. This action cannot be undone.")
        }
    }

    // MARK: - Sections

    private var avatarHeader: some View {
        VStack(spacing: Spacing.md) {
            ZStack {
                Circle()
                    .fill(Color.appTint.opacity(0.22))
                    .frame(width: 88, height: 88)
                Image(systemName: "person.fill")
                    .font(.system(size: 38))
                    .foregroundStyle(Color.appTint)
            }

            Text(authStore.currentUser?.name ?? "User")
                .font(.appTitle2)
                .tracking(Typography.Tracking.title2)
                .foregroundStyle(Color.appText)

            if let email = authStore.currentUser?.email {
                Text(email)
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(Color.appTextSecondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.lg)
    }

    private var infoSection: some View {
        sectionGroup(label: "PERSONAL INFO") {
            VStack(spacing: 0) {
                infoRow(label: "Name", value: authStore.currentUser?.name ?? "—")
                RowDivider()
                infoRow(label: "Email", value: authStore.currentUser?.email ?? "—")
            }
        }
    }

    private var healthSection: some View {
        sectionGroup(label: "HEALTH") {
            VStack(spacing: 0) {
                if let profile = profileStore.profile {
                    if let h = profile.heightCm {
                        let display = profile.preferredUnits == .imperial
                            ? formatImperialHeight(h)
                            : String(format: "%.0f cm", h)
                        infoRow(label: "Height", value: display)
                        RowDivider()
                    }
                    if let w = profile.weightKg {
                        let display = profile.preferredUnits == .imperial
                            ? String(format: "%.1f lb", w * 2.20462)
                            : String(format: "%.1f kg", w)
                        infoRow(label: "Weight", value: display)
                        RowDivider()
                    }
                    if let age = profile.ageYears {
                        infoRow(label: "Age", value: "\(age)")
                        RowDivider()
                    }
                }

                Button {
                    showHealthProfile = true
                } label: {
                    HStack {
                        Text("Edit Health Profile")
                            .font(.appBody)
                            .foregroundStyle(Color.appTint)
                        Spacer()
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
    }

    private var accountSection: some View {
        sectionGroup(label: "ACCOUNT") {
            VStack(spacing: 0) {
                Button {
                    authStore.signOut()
                    dismiss()
                } label: {
                    HStack {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 18))
                            .foregroundStyle(Color.appText)
                        Text("Sign Out")
                            .font(.appBody)
                            .foregroundStyle(Color.appText)
                        Spacer()
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.md)
                }
                .buttonStyle(.plain)

                RowDivider()

                Button {
                    showDeleteConfirmation = true
                } label: {
                    HStack {
                        Image(systemName: "trash")
                            .font(.system(size: 18))
                            .foregroundStyle(.red)
                        Text("Delete Account")
                            .font(.appBody)
                            .foregroundStyle(.red)
                        Spacer()
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, Spacing.md)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Helpers

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

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)
            Spacer()
            Text(value)
                .font(.appBody)
                .foregroundStyle(Color.appText)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    private func formatImperialHeight(_ cm: Double) -> String {
        let totalInches = cm / 2.54
        let feet = Int(totalInches) / 12
        let inches = Int(totalInches) % 12
        return "\(feet)'\(inches)\""
    }
}

// MARK: - Row divider (reused from ProfileView pattern)

private struct RowDivider: View {
    var body: some View {
        Divider()
            .padding(.leading, Spacing.lg)
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        AccountView()
    }
    .environment(AuthStore.shared)
    .environment(ProfileStore.shared)
}
