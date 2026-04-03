import SwiftUI

// MARK: - BarcodePreviewSheet

/// Shown when the user taps the barcode icon on a food that already has a barcode.
/// Displays the current barcode value and offers a remove option.
@MainActor
struct BarcodePreviewSheet: View {
    let barcode:   String
    let onRemove:  () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: Spacing.xl) {
            // Header
            VStack(spacing: Spacing.sm) {
                Image(systemName: "barcode")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.appTint)

                Text(barcode)
                    .font(.appBody)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.appText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.lg)
            }
            .padding(.top, Spacing.lg)

            // Actions
            VStack(spacing: Spacing.sm) {
                Button(role: .destructive) {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    onRemove()
                } label: {
                    Label("Remove Barcode", systemImage: "trash")
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                        .background(Color.appDestructive.opacity(0.12))
                        .foregroundStyle(Color.appDestructive)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                }
                .buttonStyle(.plain)

                Button {
                    onDismiss()
                } label: {
                    Text("Done")
                        .font(.appSubhead)
                        .foregroundStyle(Color.appTextSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Spacing.md)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg)
        }
        .padding(.bottom, Spacing.md)
    }
}
