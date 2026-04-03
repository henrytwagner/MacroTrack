@preconcurrency import AVFoundation
import UIKit
import Observation

// MARK: - ProgressCameraSession

/// Simplified AVFoundation camera for progress photos.
/// Front camera by default, photo capture only — no barcode or video frame processing.
/// Not a singleton; instantiated per use.
@Observable
@MainActor
final class ProgressCameraSession: @unchecked Sendable {

    // MARK: - Public State

    private(set) var isRunning = false
    private(set) var cameraPosition: AVCaptureDevice.Position = .front

    // MARK: - Capture Session

    @ObservationIgnored nonisolated(unsafe) let captureSession = AVCaptureSession()

    // MARK: - Private

    @ObservationIgnored nonisolated(unsafe) private var videoInput: AVCaptureDeviceInput?
    @ObservationIgnored nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()
    @ObservationIgnored nonisolated private let sessionQueue = DispatchQueue(label: "progress.camera.session")
    @ObservationIgnored nonisolated(unsafe) private var photoContinuation: CheckedContinuation<UIImage?, Never>?
    @ObservationIgnored nonisolated(unsafe) private var delegateAdapter: ProgressPhotoCaptureDelegate?

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

        let delegate = ProgressPhotoCaptureDelegate(session: self)
        delegateAdapter = delegate
        let position = cameraPosition

        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.configureSession(position: position)
            self.captureSession.startRunning()
            Task { @MainActor in self.isRunning = true }
        }
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false

        sessionQueue.async { [weak self] in
            self?.captureSession.stopRunning()
        }
    }

    func switchCamera() {
        let newPosition: AVCaptureDevice.Position = cameraPosition == .back ? .front : .back
        cameraPosition = newPosition

        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.reconfigureInput(position: newPosition)
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

    nonisolated private func configureSession(position: AVCaptureDevice.Position) {
        captureSession.beginConfiguration()
        captureSession.sessionPreset = .photo

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

        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
        }

        captureSession.commitConfiguration()
    }

    nonisolated private func reconfigureInput(position: AVCaptureDevice.Position) {
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

        captureSession.commitConfiguration()
    }

    // MARK: - Photo Capture Result

    nonisolated func handlePhotoCaptureResult(_ image: UIImage?) {
        let continuation = photoContinuation
        photoContinuation = nil
        continuation?.resume(returning: image)
    }
}

// MARK: - ProgressPhotoCaptureDelegate

nonisolated private final class ProgressPhotoCaptureDelegate: NSObject,
                                                               AVCapturePhotoCaptureDelegate,
                                                               @unchecked Sendable {
    private weak var session: ProgressCameraSession?

    init(session: ProgressCameraSession) {
        self.session = session
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
