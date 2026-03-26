import SwiftUI
import UIKit
@preconcurrency import AVFoundation

// MARK: - KitchenCameraPreview

/// `UIViewRepresentable` that renders an `AVCaptureVideoPreviewLayer`
/// filling its bounds. Used in Kitchen Mode's barcode camera section.
struct KitchenCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.previewLayer.videoGravity = .resizeAspectFill
        // Assigning the session on the main thread causes a hang (I/O).
        // Defer to a background queue so the preview layer connects without blocking.
        let layer = view.previewLayer
        let captureSession = session
        DispatchQueue.global(qos: .userInitiated).async {
            layer.session = captureSession
        }
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        // Only reassign if the session actually changed.
        let layer = uiView.previewLayer
        let captureSession = session
        if layer.session !== captureSession {
            DispatchQueue.global(qos: .userInitiated).async {
                layer.session = captureSession
            }
        }
    }

    /// Custom UIView that uses `AVCaptureVideoPreviewLayer` as its backing layer.
    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
