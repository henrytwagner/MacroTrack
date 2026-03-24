import SwiftUI

// MARK: - GoalsView

/// Entry point for goal-setting: choose Guided or Manual.
struct GoalsView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var showManualEdit: Bool = false
    @State private var showGuided:     Bool = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    Text("How do you want to set your goals?")
                        .font(.appHeadline)
                        .tracking(Typography.Tracking.headline)
                        .foregroundStyle(Color.appText)

                    Text("Guided setup uses your profile to suggest targets. You can also set numbers manually — both end on the same edit screen.")
                        .font(.appBody)
                        .tracking(Typography.Tracking.body)
                        .foregroundStyle(Color.appTextSecondary)
                        .padding(.top, Spacing.xs)

                    // Guided button (primary)
                    Button {
                        showGuided = true
                    } label: {
                        HStack(spacing: Spacing.xs) {
                            Image(systemName: "sparkles")
                            Text("Guided setup (recommended)")
                                .font(.appSubhead)
                                .fontWeight(.semibold)
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appTint)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, Spacing.md)

                    // Manual button (secondary)
                    Button {
                        showManualEdit = true
                    } label: {
                        Text("Set targets manually")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appTint)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.sm)
                    }
                    .buttonStyle(.plain)
                }
                .padding(Spacing.lg)
                .padding(.top, Spacing.sm)
            }
            .background(Color.appBackground)
            .navigationTitle("Daily Goals")
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
            .navigationDestination(isPresented: $showManualEdit) {
                GoalsEditView()
            }
            .navigationDestination(isPresented: $showGuided) {
                GoalsGuidedView()
            }
        }
    }
}

// MARK: - Preview

#Preview {
    GoalsView()
        .environment(GoalStore.shared)
        .environment(DateStore.shared)
}
