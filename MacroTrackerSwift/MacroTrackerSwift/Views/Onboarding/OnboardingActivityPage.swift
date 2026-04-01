import SwiftUI

/// Page 5: Activity level selection with branded dark cards and detailed descriptions.
struct OnboardingActivityPage: View {
    @Bindable var vm: OnboardingViewModel

    private let levels: [(ActivityLevel, String, String, String)] = [
        (.sedentary, "Sedentary",  "figure.seated.side", "Little or no exercise; mostly sitting (e.g., desk job, <5k steps/day)"),
        (.light,     "Light",      "figure.walk",        "Light exercise 1–3 days/week or on your feet some of the day (~5–7k steps/day)"),
        (.moderate,  "Moderate",   "figure.run",         "Moderate exercise 3–5 days/week or active job (~7–10k+ steps/day)"),
        (.high,      "High",       "figure.strengthtraining.functional", "Hard exercise most days or very active job (~10–14k steps/day)"),
        (.veryHigh,  "Very High",  "figure.highintensity.intervaltraining", "Intense training or physically demanding work every day (>14k steps/day)"),
    ]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: Spacing.xl) {
                Spacer(minLength: Spacing.xxxl)

                ZStack {
                    Circle()
                        .fill(Color.carbsAccent.opacity(0.1))
                        .frame(width: 80, height: 80)
                        .blur(radius: 20)
                    Image(systemName: "figure.run")
                        .font(.system(size: 32))
                        .foregroundStyle(Color.carbsAccent)
                }

                Text("How active are you?")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.appText)

                Text("Be honest — this affects your calorie target.")
                    .font(.appBody)
                    .foregroundStyle(Color.appTextSecondary)

                VStack(spacing: Spacing.sm) {
                    ForEach(levels, id: \.0) { level, label, icon, desc in
                        activityCard(label: label, icon: icon, description: desc, value: level)
                    }
                }

                Spacer(minLength: Spacing.xxxl)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.xl)
        }
    }

    @ViewBuilder
    private func activityCard(label: String, icon: String, description: String, value: ActivityLevel) -> some View {
        let selected = vm.activityLevel == value
        let accent = Color.carbsAccent
        HStack(alignment: .top, spacing: Spacing.md) {
            // Colored icon container
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
                Text(description)
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
            withAnimation(.easeInOut(duration: 0.2)) { vm.activityLevel = value }
        }
    }
}
