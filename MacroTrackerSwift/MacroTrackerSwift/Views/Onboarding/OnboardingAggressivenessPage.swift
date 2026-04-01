import SwiftUI

/// Page 7: Goal aggressiveness with branded cards and transparent descriptions.
struct OnboardingAggressivenessPage: View {
    @Bindable var vm: OnboardingViewModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: Spacing.xl) {
                Spacer(minLength: Spacing.xxxl)

                ZStack {
                    Circle()
                        .fill(accentForGoal.opacity(0.1))
                        .frame(width: 80, height: 80)
                        .blur(radius: 20)
                    Image(systemName: "gauge.with.needle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(accentForGoal)
                }

                Text("How aggressive?")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.appText)

                Text("This controls how large your calorie adjustment is.")
                    .font(.appBody)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)

                VStack(spacing: Spacing.sm) {
                    aggressivenessCard(
                        label: "Mild",
                        desc: mildDescription,
                        value: .mild,
                        icon: "tortoise.fill"
                    )
                    aggressivenessCard(
                        label: "Standard",
                        desc: standardDescription,
                        value: .standard,
                        icon: "hare.fill"
                    )
                    aggressivenessCard(
                        label: "Aggressive",
                        desc: aggressiveDescription,
                        value: .aggressive,
                        icon: "bolt.fill"
                    )
                }

                Spacer(minLength: Spacing.xxxl)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.xl)
        }
    }

    // MARK: - Accent color follows goal type

    private var accentForGoal: Color {
        switch vm.goalType {
        case .cut:      return .caloriesAccent
        case .maintain: return .carbsAccent
        case .gain:     return .proteinAccent
        }
    }

    // MARK: - Transparent descriptions (matching editing flow detail)

    private var mildDescription: String {
        switch vm.goalType {
        case .cut:      return "~0.5 lb/week loss (10% deficit). Easier to sustain, better muscle retention. Good if you're already lean or training hard."
        case .maintain: return "Tight calorie range around your TDEE. Best for recomp or holding weight precisely."
        case .gain:     return "~0.25 lb/week gain (5% surplus). Minimizes fat gain. Good for slow, lean bulking."
        }
    }

    private var standardDescription: String {
        switch vm.goalType {
        case .cut:      return "~0.75 lb/week loss (15% deficit). Balanced pace — noticeable progress without extreme restriction."
        case .maintain: return "Standard maintenance calories based on your TDEE. The default starting point."
        case .gain:     return "~0.5 lb/week gain (10% surplus). Steady muscle-building pace with moderate fat gain."
        }
    }

    private var aggressiveDescription: String {
        switch vm.goalType {
        case .cut:      return "~1 lb/week loss (20% deficit). Fastest results but harder to sustain. Higher risk of muscle loss and hunger."
        case .maintain: return "Loose range with more daily flexibility. Good if your weight naturally fluctuates."
        case .gain:     return "~0.75 lb/week gain (15% surplus). Maximum growth phase — expect some fat gain alongside muscle."
        }
    }

    // MARK: - Card

    @ViewBuilder
    private func aggressivenessCard(label: String, desc: String, value: GoalAggressiveness, icon: String) -> some View {
        let selected = vm.aggressiveness == value
        let accent = accentForGoal
        HStack(alignment: .top, spacing: Spacing.md) {
            ZStack {
                RoundedRectangle(cornerRadius: BorderRadius.md)
                    .fill(accent.opacity(selected ? 0.15 : 0.08))
                    .frame(width: 44, height: 44)
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundStyle(selected ? accent : Color.appTextSecondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(label)
                        .font(.appSubhead)
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
        .shadow(color: selected ? accent.opacity(0.1) : .clear, radius: 8, y: 2)
        .contentShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) { vm.aggressiveness = value }
        }
    }
}
