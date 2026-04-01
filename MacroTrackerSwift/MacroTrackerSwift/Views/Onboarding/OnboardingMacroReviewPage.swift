import SwiftUI

/// Page 8: Macro review with branded color-coded fields and gradient divider.
struct OnboardingMacroReviewPage: View {
    @Bindable var vm: OnboardingViewModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: Spacing.xl) {
                Spacer(minLength: Spacing.xxl)

                // Macro color bar header (website signature)
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.caloriesAccent)
                        .frame(width: 32, height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.proteinAccent)
                        .frame(width: 20, height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.carbsAccent)
                        .frame(width: 40, height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.fatAccent)
                        .frame(width: 16, height: 4)
                }

                Text("Your recommended macros")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.appText)

                Text("Calculated from your height, weight, age, sex, and activity level using the Mifflin-St Jeor equation. Adjust any value if you'd like.")
                    .font(.appBody)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)

                // Macro fields card
                VStack(spacing: 0) {
                    macroField(label: "Calories", value: $vm.calories, unit: "kcal", accent: .caloriesAccent)
                    gradientDivider
                    macroField(label: "Protein",  value: $vm.protein,  unit: "g",    accent: .proteinAccent)
                    gradientDivider
                    macroField(label: "Carbs",    value: $vm.carbs,    unit: "g",    accent: .carbsAccent)
                    gradientDivider
                    macroField(label: "Fat",      value: $vm.fat,      unit: "g",    accent: .fatAccent)
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.xl))
                .overlay(
                    RoundedRectangle(cornerRadius: BorderRadius.xl)
                        .stroke(Color.appBorderLight, lineWidth: 1)
                )

                Button {
                    vm.recalculateMacros()
                } label: {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: "arrow.clockwise")
                            .font(.appFootnote)
                        Text("Reset to recommended")
                            .font(.appFootnote)
                    }
                    .foregroundStyle(Color.appTint)
                }
                .buttonStyle(.plain)

                Spacer(minLength: Spacing.xxxl)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.xl)
        }
    }

    // MARK: - Gradient divider (website section-divider pattern)

    private var gradientDivider: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [
                        Color.appBorderLight.opacity(0.3),
                        Color.appBorderLight,
                        Color.appBorderLight.opacity(0.3),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(height: 1)
            .padding(.leading, Spacing.xxxl + Spacing.lg)
    }

    // MARK: - Macro field

    @ViewBuilder
    private func macroField(label: String, value: Binding<String>, unit: String, accent: Color) -> some View {
        HStack(spacing: Spacing.md) {
            // Colored accent dot (larger, with glow)
            ZStack {
                Circle()
                    .fill(accent.opacity(0.2))
                    .frame(width: 20, height: 20)
                    .blur(radius: 4)
                Circle()
                    .fill(accent)
                    .frame(width: 10, height: 10)
            }

            Text(label)
                .font(.appBody)
                .fontWeight(.medium)
                .foregroundStyle(Color.appText)
                .frame(width: 80, alignment: .leading)

            TextField("0", text: value)
                .keyboardType(.numberPad)
                .font(.system(size: 20, weight: .semibold, design: .monospaced))
                .multilineTextAlignment(.trailing)
                .foregroundStyle(accent)

            Text(unit)
                .font(.appFootnote)
                .foregroundStyle(Color.appTextTertiary)
                .frame(width: 36, alignment: .trailing)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.lg)
    }
}
