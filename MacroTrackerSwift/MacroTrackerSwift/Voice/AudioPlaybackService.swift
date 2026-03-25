@preconcurrency import AVFoundation
import Foundation
import Observation

// MARK: - AudioPlaybackService

/// Receives base64 PCM audio from the server (Gemini Live output at 24 kHz)
/// and plays it back gaplessly via AVAudioPlayerNode.
///
/// Format pipeline:
///   Server: base64(int16 PCM, 24 kHz mono)
///   → decode → convert int16 → float32
///   → schedule on AVAudioPlayerNode (float32 24 kHz mono)
///   → AVAudioEngine resamples to hardware output rate
///
/// Isolation note: `engine` and `playerNode` are `@ObservationIgnored nonisolated(unsafe)`
/// because the scheduleBuffer completion handler fires on a non-MainActor thread.
/// All writes to these objects happen on MainActor (start/stop/enqueue),
/// so there is no concurrent write access.
@Observable
@MainActor
final class AudioPlaybackService: @unchecked Sendable {
    static let shared = AudioPlaybackService()

    // MARK: - Public state (MainActor — observed by SwiftUI)
    private(set) var isGeminiSpeaking = false

    /// When true, incoming audio chunks are silently dropped and isGeminiSpeaking stays false.
    /// Used during inline card editing to prevent Gemini audio from triggering view re-renders.
    var muted = false

    // MARK: - Private state (MainActor)
    @ObservationIgnored private var isEngineRunning = false
    @ObservationIgnored private var scheduledCount  = 0
    @ObservationIgnored private var completedCount  = 0

    // MARK: - AVAudio (@ObservationIgnored + nonisolated — touched from completion handler thread)
    @ObservationIgnored nonisolated(unsafe) private let engine     = AVAudioEngine()
    @ObservationIgnored nonisolated(unsafe) private let playerNode = AVAudioPlayerNode()

    /// float32 non-interleaved at 24 kHz mono — Core Audio's preferred internal format.
    /// Gemini Live outputs int16 PCM at 24 kHz; we convert on enqueue.
    // AVAudioFormat is Sendable — nonisolated (no unsafe) suffices
    @ObservationIgnored nonisolated private let playbackFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate:   24_000,
        channels:     1,
        interleaved:  false
    )!

    private init() {
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: playbackFormat)
    }

    // MARK: - Lifecycle

    func startEngine() throws {
        guard !isEngineRunning else { return }
        let avSession = AVAudioSession.sharedInstance()
        try avSession.setCategory(.playAndRecord, mode: .voiceChat,
                                  options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
        try avSession.setActive(true)
        engine.prepare()
        try engine.start()
        isEngineRunning = true
        print("[AudioPlayback] engine started ✓")
    }

    func stopEngine() {
        guard isEngineRunning else { return }
        playerNode.stop()
        engine.stop()
        isEngineRunning  = false
        isGeminiSpeaking = false
        scheduledCount   = 0
        completedCount   = 0
        // AVAudioSession remains active — managed by KitchenModeViewModel lifecycle
    }

    // MARK: - Enqueue

    /// Decode `base64Data`, convert int16 → float32, schedule on the player node.
    /// - Parameters:
    ///   - base64Data: Raw PCM bytes encoded as base64 (int16, little-endian).
    ///   - mimeType: e.g. `"audio/pcm;rate=24000"` — used for future rate negotiation.
    func enqueue(base64Data: String, mimeType: String) {
        guard isEngineRunning else {
            print("[AudioPlayback] enqueue called but engine not running — dropping")
            return
        }
        guard !muted else { return }
        guard let rawData = Data(base64Encoded: base64Data), !rawData.isEmpty else {
            print("[AudioPlayback] enqueue: base64 decode failed, len=\(base64Data.count)")
            return
        }

        let frameCount = rawData.count / MemoryLayout<Int16>.size
        guard frameCount > 0 else { return }

        guard let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat,
                                            frameCapacity: AVAudioFrameCount(frameCount)),
              let floatPtr = buffer.floatChannelData else { return }

        // int16 signed → float32 normalised to [-1, 1]
        rawData.withUnsafeBytes { bytes in
            guard let src = bytes.baseAddress?.assumingMemoryBound(to: Int16.self) else { return }
            let scale = 1.0 / Float(Int16.max)
            for i in 0..<frameCount {
                floatPtr[0][i] = Float(src[i]) * scale
            }
        }
        buffer.frameLength = AVAudioFrameCount(frameCount)

        scheduledCount  += 1
        isGeminiSpeaking = true
        if scheduledCount == 1 {
            print("[AudioPlayback] first audio chunk enqueued — \(frameCount) frames")
        }
        if !playerNode.isPlaying { playerNode.play() }

        playerNode.scheduleBuffer(buffer) { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.completedCount += 1
                if self.completedCount >= self.scheduledCount {
                    print("[AudioPlayback] playback complete — \(self.completedCount) buffers")
                    self.isGeminiSpeaking = false
                }
            }
        }
    }
}
