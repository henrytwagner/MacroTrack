import SwiftUI

struct InsightBannerView: View {
    let insight: NutrientInsight
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: insight.iconName)
                .font(.system(size: 18))
                .foregroundStyle(iconColor)
                .frame(width: 32, height: 32)
                .background(iconColor.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))

            VStack(alignment: .leading, spacing: 2) {
                Text(insight.title)
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appText)
                Text(insight.message)
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextSecondary)
                    .lineLimit(2)
            }

            Spacer()

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.appTextTertiary)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
        }
        .padding(Spacing.lg)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
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
