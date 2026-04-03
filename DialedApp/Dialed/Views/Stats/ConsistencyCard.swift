import SwiftUI

struct ConsistencyCard: View {
    @Environment(StatsStore.self) private var statsStore

    var body: some View {
        HStack(spacing: Spacing.xl) {
            ringItem(label: "Days Logged", value: statsStore.consistencyScore, color: .appTint)
            ringItem(label: "Goals Met", value: statsStore.goalHitRate, color: .appSuccess)
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private func ringItem(label: String, value: Double, color: Color) -> some View {
        VStack(spacing: Spacing.sm) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.15), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: min(value / 100, 1.0))
                    .stroke(color, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                Text("\(Int(value))%")
                    .font(.appHeadline)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.appText)
                    .monospacedDigit()
            }
            .frame(width: 80, height: 80)

            Text(label)
                .font(.appCaption1)
                .foregroundStyle(Color.appTextSecondary)
        }
        .frame(maxWidth: .infinity)
    }
}
