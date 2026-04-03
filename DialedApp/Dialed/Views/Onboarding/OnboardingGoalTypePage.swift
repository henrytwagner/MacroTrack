import SwiftUI

/// Page 6: Goal type selection with prominent branded cards.
struct OnboardingGoalTypePage: View {
    @Bindable var vm: OnboardingViewModel

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color.caloriesAccent.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)
                Image(systemName: "target")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.caloriesAccent)
            }

            Text("What's your goal?")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Color.appText)

            Text("Pick what you're aiming for right now.")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)

            VStack(spacing: Spacing.sm) {
                goalCard(
                    "Lose fat",
                    icon: "flame.fill",
                    desc: "Eat below your maintenance calories to lose body fat while preserving muscle.",
                    value: .cut,
                    accent: .caloriesAccent
                )
                goalCard(
                    "Maintain",
                    icon: "equal.circle.fill",
                    desc: "Eat at your maintenance calories to hold your current weight steady.",
                    value: .maintain,
                    accent: .carbsAccent
                )
                goalCard(
                    "Build muscle",
                    icon: "dumbbell.fill",
                    desc: "Eat above your maintenance calories to support muscle growth.",
                    value: .gain,
                    accent: .proteinAccent
                )
            }

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.xl)
    }

    @ViewBuilder
    private func goalCard(_ label: String, icon: String, desc: String, value: GoalType, accent: Color) -> some View {
        let selected = vm.goalType == value
        HStack(alignment: .top, spacing: Spacing.md) {
            // Colored icon container
            ZStack {
                RoundedRectangle(cornerRadius: BorderRadius.md)
                    .fill(accent.opacity(selected ? 0.15 : 0.08))
                    .frame(width: 48, height: 48)
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundStyle(selected ? accent : Color.appTextSecondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(label)
                        .font(.appBody)
                        .fontWeight(.semibold)
                        .foregroundStyle(selected ? Color.appText : Color.appTextSecondary)
                    Spacer()
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(accent)
                    }
                }
                Text(desc)
                    .font(.appFootnote)
                    .foregroundStyle(Color.appTextTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Spacing.md)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: BorderRadius.lg)
                .stroke(selected ? accent.opacity(0.5) : Color.appBorderLight, lineWidth: selected ? 1.5 : 1)
        )
        // Colored top accent border (website pattern)
        .overlay(alignment: .top) {
            if selected {
                RoundedRectangle(cornerRadius: 1)
                    .fill(accent)
                    .frame(height: 2)
                    .padding(.horizontal, Spacing.lg)
            }
        }
        .shadow(color: selected ? accent.opacity(0.1) : .clear, radius: 8, y: 2)
        .contentShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) { vm.goalType = value }
        }
    }
}
