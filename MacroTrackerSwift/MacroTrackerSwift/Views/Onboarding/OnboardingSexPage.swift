import SwiftUI

/// Page 4: Biological sex selection with branded dark cards.
struct OnboardingSexPage: View {
    @Bindable var vm: OnboardingViewModel

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color.caloriesAccent.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)
                Image(systemName: "person.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.caloriesAccent)
            }

            Text("What's your biological sex?")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Color.appText)

            Text("Affects how we estimate your metabolism.")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)

            VStack(spacing: Spacing.sm) {
                sexCard("Male", icon: "figure.stand", value: .male, accent: .appTint)
                sexCard("Female", icon: "figure.stand.dress", value: .female, accent: .caloriesAccent)
                sexCard("Prefer not to say", icon: "person.fill.questionmark", value: .unspecified, accent: .appTextSecondary)
            }
            .padding(.top, Spacing.xs)

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.xl)
    }

    @ViewBuilder
    private func sexCard(_ label: String, icon: String, value: Sex, accent: Color) -> some View {
        let selected = vm.sex == value
        let cardAccent = selected ? accent : Color.clear
        HStack(spacing: Spacing.md) {
            // Colored icon container (website pattern)
            ZStack {
                RoundedRectangle(cornerRadius: BorderRadius.md)
                    .fill(accent.opacity(selected ? 0.15 : 0.08))
                    .frame(width: 44, height: 44)
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundStyle(selected ? accent : Color.appTextSecondary)
            }

            Text(label)
                .font(.appBody)
                .fontWeight(selected ? .semibold : .regular)
                .foregroundStyle(selected ? Color.appText : Color.appTextSecondary)

            Spacer()

            if selected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(accent)
            }
        }
        .padding(Spacing.md)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: BorderRadius.lg)
                .stroke(selected ? cardAccent.opacity(0.5) : Color.appBorderLight, lineWidth: selected ? 1.5 : 1)
        )
        .shadow(color: selected ? cardAccent.opacity(0.1) : .clear, radius: 8, y: 2)
        .contentShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) { vm.sex = value }
        }
    }
}
