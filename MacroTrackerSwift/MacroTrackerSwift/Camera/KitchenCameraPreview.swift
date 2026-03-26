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
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        uiView.previewLayer.session = session
    }

    /// Custom UIView that uses `AVCaptureVideoPreviewLayer` as its backing layer.
    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
