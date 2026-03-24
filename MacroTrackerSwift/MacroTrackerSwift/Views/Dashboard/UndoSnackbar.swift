import SwiftUI
import UIKit

// MARK: - UndoSnackbar

/// Bottom-anchored snackbar with a message and an "Undo" action.
/// Slides up with a spring animation; auto-dismisses after 4 seconds.
struct UndoSnackbar: View {
    let message:   String
    let visible:   Bool
    let onUndo:    () -> Void
    let onDismiss: () -> Void

    @State private var autoDismissTask: Task<Void, Never>? = nil

    private var snackbarBackground: Color {
        Color(UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return UIColor(red: 44.0 / 255, green: 44.0 / 255, blue: 46.0 / 255, alpha: 1)
            } else {
                return UIColor(red: 0.196, green: 0.196, blue: 0.196, alpha: 1)
            }
        })
    }

    var body: some View {
        VStack {
            Spacer()

            if visible {
                HStack(spacing: Spacing.md) {
                    Text(message)
                        .font(.appSubhead)
                        .foregroundStyle(Color.white)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button("Undo") {
                        autoDismissTask?.cancel()
                        onUndo()
                    }
                    .font(.appSubhead)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appTint)
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)
                .background(snackbarBackground)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                .shadow(color: Color.black.opacity(0.12), radius: 8, x: 0, y: 4)
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.lg)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: visible)
        .onChange(of: visible) { _, isVisible in
            autoDismissTask?.cancel()
            guard isVisible else { return }
            autoDismissTask = Task {
                try? await Task.sleep(for: .seconds(4))
                guard !Task.isCancelled else { return }
                await MainActor.run { onDismiss() }
            }
        }
    }
}
