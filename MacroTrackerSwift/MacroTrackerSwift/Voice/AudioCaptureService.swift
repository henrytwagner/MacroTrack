@preconcurrency import AVFoundation
import Foundation
import Observation

// MARK: - AudioCaptureError

enum AudioCaptureError: Error {
    case converterCreationFailed
    case engineStartFailed(Error)
}

// MARK: - AudioCaptureService

/// Captures microphone audio via AVAudioEngine, applies energy-based VAD,
/// resamples to 16 kHz int16 mono, and streams base64 audioChunk messages
/// over the active WSClient connection.
///
/// Isolation note: `engine`, `converter`, and VAD state are marked
/// `@ObservationIgnored nonisolated(unsafe)` because they are read from the real-time
/// audio tap callback (which runs on a non-MainActor thread). All writes happen only
/// at start/stop time on the MainActor, so there is no concurrent write access.
@Observable
@MainActor
final class AudioCaptureService: @unchecked Sendable {
    static let shared = AudioCaptureService()

    // MARK: - Public state (MainActor — observed by SwiftUI)
    private(set) var isCapturing = false
    private(set) var chunksSent: Int = 0
    /// True when RMS exceeded the VAD threshold within the last grace period.
    private(set) var vadActive = false

    // MARK: - AVAudio (@ObservationIgnored + nonisolated — read from audio tap thread)
    @ObservationIgnored nonisolated(unsafe) private let engine = AVAudioEngine()
    @ObservationIgnored nonisolated(unsafe) private var converter: AVAudioConverter?
    // AVAudioFormat is Sendable — no unsafe needed; nonisolated for cross-isolation access
    @ObservationIgnored nonisolated private let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate:   16_000,
        channels:     1,
        interleaved:  true
    )!

    // MARK: - VAD state (@ObservationIgnored + nonisolated — written from audio tap thread)
    @ObservationIgnored nonisolated(unsafe) private var lastVoiceTime: TimeInterval = 0
    /// ~-42 dBFS — empirically good for speech in a quiet kitchen.
    @ObservationIgnored nonisolated private let silenceThresholdRMS: Float = 0.008
    /// Send audio for 600 ms after the last voiced frame to capture trailing phonemes.
    /// 300 ms was too short — brief pauses mid-utterance triggered premature end-of-turn.
    @ObservationIgnored nonisolated private let silenceGracePeriod: TimeInterval = 0.6
    @ObservationIgnored nonisolated(unsafe) private var tapSequence = 0

    private init() {}

    // MARK: - Permission

    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    // MARK: - Lifecycle

    func start() throws {
        guard !isCapturing else { return }

        let avSession = AVAudioSession.sharedInstance()
        try avSession.setCategory(.playAndRecord, mode: .measurement,
                                  options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
        try avSession.setActive(true)

        let inputNode = engine.inputNode
        let hwFormat  = inputNode.outputFormat(forBus: 0)

        guard let conv = AVAudioConverter(from: hwFormat, to: targetFormat) else {
            throw AudioCaptureError.converterCreationFailed
        }
        converter     = conv
        lastVoiceTime = Date().timeIntervalSinceReferenceDate
        tapSequence   = 0

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: hwFormat) { [weak self] buffer, _ in
            self?.processTap(buffer: buffer)
        }

        engine.prepare()
        do {
            try engine.start()
        } catch {
            inputNode.removeTap(onBus: 0)
            throw AudioCaptureError.engineStartFailed(error)
        }
        isCapturing = true
        chunksSent  = 0
    }

    func stop() {
        guard isCapturing else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        converter   = nil
        isCapturing = false
        vadActive   = false
        // AVAudioSession remains active — managed by KitchenModeViewModel lifecycle
    }

    // MARK: - Tap processing (real-time audio thread — nonisolated)

    nonisolated private func processTap(buffer: AVAudioPCMBuffer) {
        guard let floatData = buffer.floatChannelData else { return }
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else { return }

        // Compute RMS energy for voice activity detection
        var sumSq: Float = 0
        for i in 0..<frameCount {
            let s = floatData[0][i]
            sumSq += s * s
        }
        let rms = sqrtf(sumSq / Float(frameCount))

        let now = Date().timeIntervalSinceReferenceDate
        let isVoicedNow = rms >= silenceThresholdRMS  // true only for frames above threshold
        if isVoicedNow { lastVoiceTime = now }
        // Drop the buffer if we've been silent longer than the grace period
        guard now - lastVoiceTime < silenceGracePeriod else {
            Task { @MainActor in AudioCaptureService.shared.vadActive = false }
            return
        }

        // Downsample hardware format → 16 kHz int16
        guard let conv = converter else { return }

        let outCapacity = AVAudioFrameCount(
            ceil(Double(frameCount) * 16_000.0 / buffer.format.sampleRate) + 2
        )
        guard let outBuf = AVAudioPCMBuffer(pcmFormat: targetFormat,
                                             frameCapacity: outCapacity) else { return }

        var inputUsed  = false
        var convError: NSError?
        conv.convert(to: outBuf, error: &convError) { _, outStatus in
            if inputUsed { outStatus.pointee = .noDataNow; return nil }
            inputUsed = true
            outStatus.pointee = .haveData
            return buffer
        }
        guard convError == nil, outBuf.frameLength > 0,
              let int16Ptr = outBuf.int16ChannelData else { return }

        let byteCount = Int(outBuf.frameLength) * MemoryLayout<Int16>.size
        let rawData   = Data(bytes: int16Ptr[0], count: byteCount)
        let b64       = rawData.base64EncodedString()

        let seq = tapSequence
        tapSequence += 1

        // Hop to MainActor only for the WS send and observable state updates — very cheap
        Task { @MainActor in
            WSClient.shared.send(.audioChunk(data: b64, sequence: seq))
            AudioCaptureService.shared.chunksSent += 1
            AudioCaptureService.shared.vadActive = isVoicedNow
        }
    }
}
