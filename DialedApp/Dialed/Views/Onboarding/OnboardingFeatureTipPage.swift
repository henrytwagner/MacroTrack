import SwiftUI

/// Pages 9–10: Feature tips with branded icon glows and atmospheric backgrounds.
struct OnboardingFeatureTipPage: View {
    let icon: String
    let iconColor: Color
    let glowColor: Color
    let title: String
    let headline: String
    let detail: String

    var body: some View {
        ZStack {
            // Atmospheric background glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [glowColor.opacity(0.08), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 250
                    )
                )
                .frame(width: 500, height: 500)
                .offset(y: -60)

            VStack(spacing: Spacing.xl) {
                Spacer()

                // Large icon with glow
                ZStack {
                    Circle()
                        .fill(glowColor.opacity(0.12))
                        .frame(width: 120, height: 120)
                        .blur(radius: 30)
                    Circle()
                        .fill(glowColor.opacity(0.08))
                        .frame(width: 160, height: 160)
                        .blur(radius: 50)

                    Image(systemName: icon)
                        .font(.system(size: 56))
                        .foregroundStyle(iconColor)
                }

                Text(title)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.appText)

                Text(headline)
                    .font(.appHeadline)
                    .foregroundStyle(Color.appTextSecondary)

                Text(detail)
                    .font(.appBody)
                    .foregroundStyle(Color.appTextTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.lg)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer()
                Spacer()
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.xl)
        }
    }
}
