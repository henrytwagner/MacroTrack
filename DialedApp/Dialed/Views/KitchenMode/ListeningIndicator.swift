import SwiftUI

// MARK: - ListeningState

/// Maps to the Gemini Live audio pipeline states.
/// - idle: no session active
/// - capturing: mic is on, user may be speaking
/// - geminiSpeaking: Gemini voice is playing back
/// - processing: audio sent, waiting for server response
/// - paused: user manually paused
enum ListeningState {
    case idle
    case capturing
    case processing
    case geminiSpeaking
    case paused
}

// MARK: - ListeningIndicator

/// Animated 5-bar spectrum indicator showing voice session state.
/// Port of mobile/components/ListeningIndicator.tsx.
struct ListeningIndicator: View {
    let state: ListeningState
    var onPress: (() -> Void)? = nil

    private let barCount = 5
    private let baseHeight: CGFloat = 6
    private let maxHeight: CGFloat = 32

    private var barColor: Color {
        switch state {
        case .processing:     return .appWarning
        case .geminiSpeaking: return .appTint
        case .paused:         return .appTextTertiary
        default:              return .appTint
        }
    }

    private var labelColor: Color {
        switch state {
        case .processing:     return .appWarning
        case .geminiSpeaking: return .appTint
        case .paused:         return .appTextTertiary
        default:              return .appTextSecondary
        }
    }

    private var labelText: String? {
        switch state {
        case .idle:            return nil
        case .capturing:       return "Listening\u{2026}"
        case .processing:      return "Processing\u{2026}"
        case .geminiSpeaking:  return "Speaking\u{2026}"
        case .paused:          return "Tap to resume"
        }
    }

    var body: some View {
        let content = VStack(spacing: Spacing.sm) {
            HStack(spacing: 5) {
                ForEach(0..<barCount, id: \.self) { index in
                    AnimatedBar(
                        index: index,
                        state: state,
                        baseHeight: baseHeight,
                        maxHeight: maxHeight,
                        color: barColor
                    )
                }
            }
            .frame(height: maxHeight + 4)

            if let labelText {
                Text(labelText)
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .foregroundStyle(labelColor)
            }
        }

        if let onPress {
            Button(action: onPress) {
                content
            }
            .buttonStyle(.plain)
            .accessibilityLabel(state == .paused ? "Resume listening" : "Pause listening")
        } else {
            content
        }
    }
}

// MARK: - AnimatedBar

/// A single bar that animates its height based on listening state.
private struct AnimatedBar: View {
    let index: Int
    let state: ListeningState
    let baseHeight: CGFloat
    let maxHeight: CGFloat
    let color: Color

    @State private var animatedHeight: CGFloat = 6

    private var opacity: Double {
        (state == .idle || state == .paused) ? 0.25 : 1.0
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: 4, height: animatedHeight)
            .opacity(opacity)
            .onChange(of: state) { _, newState in
                startAnimation(for: newState)
            }
            .onAppear {
                startAnimation(for: state)
            }
    }

    private func startAnimation(for listenState: ListeningState) {
        switch listenState {
        case .capturing, .geminiSpeaking:
            // Staggered bounce — bar height varies by position (sine curve)
            let barMax = maxHeight * (0.5 + 0.5 * sin(Double(index) / Double(5) * .pi))
            let duration = 0.4 + Double(index) * 0.06
            let delay = Double(index) * 0.12

            withAnimation(
                .easeInOut(duration: duration)
                .repeatForever(autoreverses: true)
                .delay(delay)
            ) {
                animatedHeight = barMax
            }

        case .processing:
            // Subtle pulse — all bars, same height
            withAnimation(
                .easeInOut(duration: 0.3)
                .repeatForever(autoreverses: true)
            ) {
                animatedHeight = baseHeight + 8
            }

        case .idle, .paused:
            withAnimation(.easeOut(duration: 0.2)) {
                animatedHeight = baseHeight
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        ListeningIndicator(state: .idle)
        ListeningIndicator(state: .capturing)
        ListeningIndicator(state: .processing)
        ListeningIndicator(state: .geminiSpeaking)
        ListeningIndicator(state: .paused)
    }
    .padding()
}
