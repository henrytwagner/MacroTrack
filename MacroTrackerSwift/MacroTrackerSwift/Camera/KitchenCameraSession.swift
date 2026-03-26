@preconcurrency import AVFoundation
import UIKit
import Observation

// MARK: - KitchenCameraSession

/// AVFoundation camera engine for Kitchen Mode.
/// Provides live preview, barcode detection, photo capture, frame access,
/// camera flip, and torch control.
///
/// **Dual output architecture:**
/// - `AVCaptureMetadataOutput` — hardware-accelerated barcode detection at full frame rate
/// - `AVCaptureVideoDataOutput` — per-frame pixel buffer access for Gemini image capture
///   and future CoreML inference (YOLO, AR overlays)
///
/// **Video-only** — no `AVCaptureAudioDataOutput` is added, so this does not
/// interfere with `AudioCaptureService`'s `AVAudioEngine` tap.
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

    // MARK: - Capture session

    @ObservationIgnored nonisolated(unsafe) let captureSession = AVCaptureSession()

    // MARK: - Private

    @ObservationIgnored nonisolated(unsafe) private var videoInput: AVCaptureDeviceInput?
    @ObservationIgnored nonisolated(unsafe) private let videoOutput = AVCaptureVideoDataOutput()
    @ObservationIgnored nonisolated(unsafe) private let metadataOutput = AVCaptureMetadataOutput()
    @ObservationIgnored nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()
    @ObservationIgnored nonisolated private let sessionQueue = DispatchQueue(label: "camera.session")

    /// Deduplication: ignore same barcode string within 2 seconds.
    @ObservationIgnored nonisolated(unsafe) private var lastDetectedGTIN: String?
    @ObservationIgnored nonisolated(unsafe) private var lastDetectedTime: TimeInterval = 0
    @ObservationIgnored nonisolated private let deduplicationInterval: TimeInterval = 2.0

    /// Photo capture continuation.
    @ObservationIgnored nonisolated(unsafe) private var photoContinuation: CheckedContinuation<UIImage?, Never>?

    /// Delegate retained for lifetime of session.
    @ObservationIgnored nonisolated(unsafe) private var delegateAdapter: CameraOutputDelegate?

    /// Barcode symbologies for metadata output — all common product formats.
    @ObservationIgnored nonisolated private let barcodeTypes: [AVMetadataObject.ObjectType] = [
        .ean8, .ean13, .upce, .code128, .code39, .code93,
        .interleaved2of5, .itf14, .dataMatrix, .qr, .pdf417,
    ]

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

        if newPosition == .front { torchEnabled = false }

        guard let delegate = delegateAdapter else { return }
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.reconfigureInput(position: newPosition, delegate: delegate)
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

        configureAutofocus(device: device)

        // 1. Video data output — frame access for Gemini and future CoreML
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(delegate, queue: sessionQueue)
        if captureSession.canAddOutput(videoOutput) {
            captureSession.addOutput(videoOutput)
        }

        // 2. Metadata output — hardware-accelerated barcode detection
        //    Must be added BEFORE setting metadataObjectTypes (Apple requirement).
        metadataOutput.setMetadataObjectsDelegate(delegate, queue: sessionQueue)
        if captureSession.canAddOutput(metadataOutput) {
            captureSession.addOutput(metadataOutput)
            metadataOutput.metadataObjectTypes = barcodeTypes.filter {
                metadataOutput.availableMetadataObjectTypes.contains($0)
            }
        }

        // 3. Photo output — single-frame capture
        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
        }

        captureSession.commitConfiguration()
    }

    nonisolated private func reconfigureInput(position: AVCaptureDevice.Position,
                                               delegate: CameraOutputDelegate) {
        captureSession.beginConfiguration()

        if let existing = videoInput {
            captureSession.removeInput(existing)
            videoInput = nil
        }

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

        configureAutofocus(device: device)

        // Re-wire delegates after input swap
        videoOutput.setSampleBufferDelegate(delegate, queue: sessionQueue)
        metadataOutput.setMetadataObjectsDelegate(delegate, queue: sessionQueue)

        captureSession.commitConfiguration()
    }

    // MARK: - Autofocus

    nonisolated private func configureAutofocus(device: AVCaptureDevice) {
        try? device.lockForConfiguration()

        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }

        if device.isAutoFocusRangeRestrictionSupported {
            device.autoFocusRangeRestriction = .near
        }

        device.unlockForConfiguration()
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

    // MARK: - Barcode Detection (via AVCaptureMetadataOutput — hardware accelerated)

    nonisolated func handleMetadataObjects(_ objects: [AVMetadataObject]) {
        guard let readable = objects.first as? AVMetadataMachineReadableCodeObject,
              let raw = readable.stringValue
        else { return }

        let gtin = GTINNormalizer.normalizeToGTIN(raw, type: readable.type)
        guard !gtin.isEmpty else { return }

        // Deduplication
        let now = Date().timeIntervalSinceReferenceDate
        if gtin == lastDetectedGTIN,
           now - lastDetectedTime < deduplicationInterval {
            return
        }
        lastDetectedGTIN = gtin
        lastDetectedTime = now

        Task { @MainActor in
            self.onBarcodeDetected?(gtin)
        }
    }

    // MARK: - Frame Processing (video data output — for future Gemini/CoreML use)

    nonisolated func processFrame(_ sampleBuffer: CMSampleBuffer) {
        // Frame access point for future features:
        // - Gemini image identification (capturePhoto handles one-shot; this enables streaming)
        // - YOLO-World / CoreML live inference
        // - AR overlay data extraction
        //
        // Currently a no-op — barcode detection is handled by metadata output.
    }

    // MARK: - Photo Capture Result

    nonisolated func handlePhotoCaptureResult(_ image: UIImage?) {
        let continuation = photoContinuation
        photoContinuation = nil
        continuation?.resume(returning: image)
    }

}

// MARK: - CameraOutputDelegate

nonisolated private final class CameraOutputDelegate: NSObject,
                                                       AVCaptureVideoDataOutputSampleBufferDelegate,
                                                       AVCaptureMetadataOutputObjectsDelegate,
                                                       AVCapturePhotoCaptureDelegate,
                                                       @unchecked Sendable {
    private weak var session: KitchenCameraSession?

    init(session: KitchenCameraSession) {
        self.session = session
    }

    // MARK: - Video frames (for Gemini/CoreML — future use)

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        session?.processFrame(sampleBuffer)
    }

    // MARK: - Barcode detection (hardware-accelerated metadata output)

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                        didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        session?.handleMetadataObjects(metadataObjects)
    }

    // MARK: - Photo capture

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
