import SwiftUI

// MARK: - Glass Card Modifier

/// Applies a frosted-glass card appearance for Kitchen Mode.
/// Hero cards get stronger fill and border; compact cards are more subtle.
struct GlassCard: ViewModifier {
    let isHero: Bool

    func body(content: Content) -> some View {
        content
            .padding(isHero ? Spacing.xl : Spacing.md)
            .background(
                .ultraThinMaterial,
                in: RoundedRectangle(cornerRadius: BorderRadius.lg)
            )
            .background(
                RoundedRectangle(cornerRadius: BorderRadius.lg)
                    .fill(isHero ? KitchenTheme.cardFill : KitchenTheme.compactCardFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: BorderRadius.lg)
                    .stroke(
                        isHero ? KitchenTheme.cardBorder : KitchenTheme.compactCardBorder,
                        lineWidth: 1
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }
}

extension View {
    func glassCard(isHero: Bool = false) -> some View {
        modifier(GlassCard(isHero: isHero))
    }
}
