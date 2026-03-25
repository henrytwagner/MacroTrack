import SwiftUI

// MARK: - KitchenModeDebugView

/// Minimal debug harness for Session E2.
/// Verifies: WS connect/disconnect, audio capture start/stop,
/// Gemini audio playback (isGeminiSpeaking toggle), and live transcript.
/// Remove or gate behind a feature flag when Kitchen Mode UI ships (Phase E3).
@MainActor
struct KitchenModeDebugView: View {
    @Environment(DraftStore.self) private var draft
    @Environment(DateStore.self)  private var dateStore

    @State private var statusLog: String = "Ready"

    private let capture  = AudioCaptureService.shared
    private let playback = AudioPlaybackService.shared
    private let ws       = WSClient.shared

    var body: some View {
        NavigationStack {
            List {
                connectionSection
                audioSection
                if !draft.captionText.isEmpty { transcriptSection }
                draftSection
                statusSection
            }
            .navigationTitle("Kitchen Mode Debug")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Sections

    private var connectionSection: some View {
        Section("WebSocket") {
            labeledStatus("Status", value: ws.isConnected ? "Connected" : "Disconnected",
                          active: ws.isConnected)
            Button(ws.isConnected ? "Disconnect" : "Connect to /ws/kitchen-mode") {
                toggleConnection()
            }
        }
    }

    private var audioSection: some View {
        Section("Audio") {
            labeledStatus("Capture",         value: capture.isCapturing ? "Recording" : "Idle",           active: capture.isCapturing)
            labeledStatus("VAD",             value: capture.vadActive ? "Voice detected" : "Silence",     active: capture.vadActive)
            labeledStatus("Chunks Sent",     value: "\(capture.chunksSent)",                              active: capture.chunksSent > 0)
            labeledStatus("Gemini Speaking", value: playback.isGeminiSpeaking ? "Speaking" : "Silent",    active: playback.isGeminiSpeaking)
            Button(capture.isCapturing ? "Stop Capture" : "Start Capture") {
                toggleCapture()
            }
        }
    }

    private var transcriptSection: some View {
        Section("Live Transcript") {
            Text(draft.captionText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var draftSection: some View {
        Section("Draft (\(draft.items.count) item\(draft.items.count == 1 ? "" : "s"))") {
            if draft.items.isEmpty {
                Text("No items yet — speak something after connecting.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(draft.items) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.body)
                            Text("\(item.quantity, specifier: "%.0f") \(item.unit)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(Int(item.calories)) kcal")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var statusSection: some View {
        Section("Log") {
            Text(statusLog)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Actions

    private func toggleConnection() {
        if ws.isConnected {
            capture.stop()
            ws.disconnect()
            playback.stopEngine()
            draft.reset()
            log("Disconnected")
        } else {
            do {
                try playback.startEngine()
                let date = dateStore.selectedDate
                ws.connect(date: date)
                draft.initSession(savedTotals: .zero)
                log("Connected — date: \(date)")
            } catch {
                log("Engine start failed: \(error.localizedDescription)")
            }
        }
    }

    private func toggleCapture() {
        if capture.isCapturing {
            capture.stop()
            log("Capture stopped")
        } else {
            Task {
                let granted = await capture.requestPermission()
                guard granted else { log("Microphone permission denied"); return }
                do {
                    try capture.start()
                    log("Capturing…")
                } catch {
                    log("Capture start failed: \(error.localizedDescription)")
                }
            }
        }
    }

    private func log(_ message: String) {
        let ts = Date().formatted(.dateTime.hour().minute().second())
        statusLog = "[\(ts)] \(message)"
    }

    // MARK: - Helpers

    private func labeledStatus(_ label: String, value: String, active: Bool) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundStyle(active ? Color.green : Color.secondary)
                .fontWeight(active ? .medium : .regular)
        }
    }
}

#Preview {
    KitchenModeDebugView()
        .environment(DraftStore.shared)
        .environment(DateStore.shared)
}
