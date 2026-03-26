@preconcurrency import AVFoundation
import UIKit
import Vision
import Observation

// MARK: - KitchenCameraSession

/// AVFoundation camera engine for Kitchen Mode.
/// Provides live preview, inline barcode detection (via Vision), photo capture,
/// camera flip, and torch control.
///
/// **Video-only** — no `AVCaptureAudioDataOutput` is added, so this does not
/// interfere with `AudioCaptureService`'s `AVAudioEngine` tap.
///
/// Frame processing runs on a dedicated serial queue (`sessionQueue`).
/// Barcode results are dispatched to `@MainActor` via Task.
@Observable
@MainActor
final class KitchenCameraSession: @unchecked Sendable {
    static let shared = KitchenCameraSession()

    // MARK: - Public State

    private(set) var isRunning = false
    private(set) var cameraPosition: AVCaptureDevice.Position = .back
    var torchEnabled = false { didSet { applyTorch() } }

    /// Called on @MainActor when a barcode is detected (already deduplicated).
    var onBarcodeDetected: ((String) -> Void)?

    // MARK: - Capture session (nonisolated — accessed from sessionQueue and SwiftUI)

    /// The underlying capture session — bound to `KitchenCameraPreview`.
    /// Marked `nonisolated(unsafe)` because `AVCaptureSession` is not Sendable
    /// but must be accessed from both MainActor (preview binding) and sessionQueue.
    @ObservationIgnored nonisolated(unsafe) let captureSession = AVCaptureSession()

    // MARK: - Private (accessed from sessionQueue — nonisolated)

    @ObservationIgnored nonisolated(unsafe) private var videoInput: AVCaptureDeviceInput?
    @ObservationIgnored nonisolated(unsafe) private let videoOutput = AVCaptureVideoDataOutput()
    @ObservationIgnored nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()
    @ObservationIgnored nonisolated private let sessionQueue = DispatchQueue(label: "camera.session")

    /// Throttle: process 1 in every N frames for barcode detection (~2fps at 30fps).
    @ObservationIgnored nonisolated(unsafe) private var frameCounter: Int = 0
    @ObservationIgnored nonisolated private let detectEveryNFrames = 15

    /// Deduplication: ignore same GTIN within 2 seconds.
    @ObservationIgnored nonisolated(unsafe) private var lastDetectedGTIN: String?
    @ObservationIgnored nonisolated(unsafe) private var lastDetectedTime: TimeInterval = 0
    @ObservationIgnored nonisolated private let deduplicationInterval: TimeInterval = 2.0

    /// Photo capture continuation (only one in flight at a time).
    @ObservationIgnored nonisolated(unsafe) private var photoContinuation: CheckedContinuation<UIImage?, Never>?

    /// Delegate must be retained.
    @ObservationIgnored nonisolated(unsafe) private var delegateAdapter: CameraOutputDelegate?

    private init() {}

    // MARK: - Permission

    func requestPermission() async -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .authorized:
            return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video)
        default:
            return false
        }
    }

    // MARK: - Lifecycle

    func start() {
        guard !isRunning else { return }

        let delegate = CameraOutputDelegate(session: self)
        delegateAdapter = delegate
        let position = cameraPosition

        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.configureSession(position: position, delegate: delegate)
            self.captureSession.startRunning()
            Task { @MainActor in self.isRunning = true }
        }
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
        torchEnabled = false

        sessionQueue.async { [weak self] in
            self?.captureSession.stopRunning()
        }
    }

    func switchCamera() {
        let newPosition: AVCaptureDevice.Position = cameraPosition == .back ? .front : .back
        cameraPosition = newPosition

        // Front camera doesn't support torch
        if newPosition == .front { torchEnabled = false }

        guard let delegate = delegateAdapter else { return }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.reconfigureInput(position: newPosition)
            self.frameCounter = 0
            self.videoOutput.setSampleBufferDelegate(delegate, queue: self.sessionQueue)
        }
    }

    /// Capture a single photo and return as UIImage.
    func capturePhoto() async -> UIImage? {
        guard isRunning, let delegate = delegateAdapter else { return nil }
        return await withCheckedContinuation { continuation in
            self.photoContinuation = continuation
            let settings = AVCapturePhotoSettings()
            self.photoOutput.capturePhoto(with: settings, delegate: delegate)
        }
    }

    // MARK: - Session Configuration (runs on sessionQueue)

    nonisolated private func configureSession(position: AVCaptureDevice.Position,
                                               delegate: CameraOutputDelegate) {
        captureSession.beginConfiguration()
        captureSession.sessionPreset = .high

        // Video input
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                    for: .video,
                                                    position: position),
              let input = try? AVCaptureDeviceInput(device: device)
        else {
            captureSession.commitConfiguration()
            return
        }

        if captureSession.canAddInput(input) {
            captureSession.addInput(input)
            videoInput = input
        }

        // Video output for frame-level barcode detection
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(delegate, queue: sessionQueue)
        if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
        }

        // Photo output for single-frame capture
        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
        }

        captureSession.commitConfiguration()
    }

    nonisolated private func reconfigureInput(position: AVCaptureDevice.Position) {
        captureSession.beginConfiguration()

        // Remove existing input
        if let existing = videoInput {
            captureSession.removeInput(existing)
            videoInput = nil
        }

        // Add new input
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                    for: .video,
                                                    position: position),
              let input = try? AVCaptureDeviceInput(device: device)
        else {
            captureSession.commitConfiguration()
            return
        }

        if captureSession.canAddInput(input) {
            captureSession.addInput(input)
            videoInput = input
        }

        captureSession.commitConfiguration()
    }

    // MARK: - Torch

    private func applyTorch() {
        guard cameraPosition == .back,
              let device = videoInput?.device,
              device.hasTorch
        else { return }
        let wantTorch = torchEnabled
        sessionQueue.async {
            try? device.lockForConfiguration()
            device.torchMode = wantTorch ? .on : .off
            device.unlockForConfiguration()
        }
    }

    // MARK: - Frame Processing (called from delegate on sessionQueue)

    nonisolated func processFrame(_ sampleBuffer: CMSampleBuffer) {
        frameCounter += 1
        guard frameCounter % detectEveryNFrames == 0 else { return }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let request = VNDetectBarcodesRequest { [weak self] request, _ in
            guard let self,
                  let results = request.results as? [VNBarcodeObservation],
                  let first = results.first,
                  let payload = first.payloadStringValue
            else { return }

            let gtin = self.normalizeToGTIN13(raw: payload)
            guard !gtin.isEmpty else { return }

            // Deduplication
            let now = Date().timeIntervalSinceReferenceDate
            if gtin == self.lastDetectedGTIN,
               now - self.lastDetectedTime < self.deduplicationInterval {
                return
            }
            self.lastDetectedGTIN = gtin
            self.lastDetectedTime = now

            Task { @MainActor in
                self.onBarcodeDetected?(gtin)
            }
        }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        try? handler.perform([request])
    }

    // MARK: - Photo Capture Result (called from delegate)

    nonisolated func handlePhotoCaptureResult(_ image: UIImage?) {
        let continuation = photoContinuation
        photoContinuation = nil
        continuation?.resume(returning: image)
    }

    // MARK: - GTIN Normalization (port of mobile/features/barcode/gtin.ts)

    nonisolated private func normalizeToGTIN13(raw: String) -> String {
        let digits = raw.filter(\.isNumber)
        let len = digits.count

        guard len == 8 || len == 12 || len == 13 else { return "" }

        let gtin13: String
        switch len {
        case 13:
            gtin13 = digits
        case 12:
            gtin13 = "0" + digits
        case 8:
            // Default to EAN-8 (pad with five 0s). UPC-E expansion is rare for
            // inline scanning and would need format hints we don't get from Vision.
            gtin13 = "00000" + digits
        default:
            return ""
        }

        guard validateGTIN13CheckDigit(gtin13) else { return "" }
        return gtin13
    }

    nonisolated private func validateGTIN13CheckDigit(_ gtin: String) -> Bool {
        guard gtin.count == 13 else { return false }
        let chars = Array(gtin)
        var sum = 0
        for i in 0..<12 {
            guard let d = chars[i].wholeNumberValue else { return false }
            sum += d * (i % 2 == 0 ? 1 : 3)
        }
        guard let checkDigit = chars[12].wholeNumberValue else { return false }
        return (sum + checkDigit) % 10 == 0
    }
}

// MARK: - CameraOutputDelegate

/// Bridges AVFoundation delegate callbacks to `KitchenCameraSession`.
/// Opted out of MainActor default so delegate methods can be called from the session queue.
nonisolated private final class CameraOutputDelegate: NSObject,
                                                       AVCaptureVideoDataOutputSampleBufferDelegate,
                                                       AVCapturePhotoCaptureDelegate,
                                                       @unchecked Sendable {
    private weak var session: KitchenCameraSession?

    init(session: KitchenCameraSession) {
        self.session = session
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        session?.processFrame(sampleBuffer)
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard error == nil,
              let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data)
        else {
            session?.handlePhotoCaptureResult(nil)
            return
        }
        session?.handlePhotoCaptureResult(image)
    }
}
