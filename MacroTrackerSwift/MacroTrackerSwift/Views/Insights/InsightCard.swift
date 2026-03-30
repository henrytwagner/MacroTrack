import SwiftUI

struct InsightCard: View {
    let insight: NutrientInsight

    var body: some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: insight.iconName)
                .font(.system(size: 16))
                .foregroundStyle(iconColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(insight.title)
                    .font(.appSubhead)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.appText)
                Text(insight.message)
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
            }

            Spacer()
        }
        .padding(Spacing.lg)
    }

    private var iconColor: Color {
        switch insight.type {
        case .streak:    return .appWarning
        case .warning:   return .appDestructive
        case .pattern:   return .appTint
        case .milestone: return .appSuccess
        }
    }
}
