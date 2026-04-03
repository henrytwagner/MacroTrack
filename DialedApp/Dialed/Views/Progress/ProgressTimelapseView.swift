import SwiftUI
import AVFoundation

// MARK: - ProgressTimelapseView

/// Animated playback of progress photos for a selected pose, with
/// crossfade transitions, speed control, and a scrubber.
struct ProgressTimelapseView: View {
    @Environment(ProgressPhotoStore.self) private var photoStore
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPose: PhotoPose = .front
    @State private var currentIndex: Int = 0
    @State private var isPlaying: Bool = false
    @State private var frameDuration: Double = 1.0
    @State private var frames: [UIImage] = []
    @State private var isLoading: Bool = true
    @State private var playTask: Task<Void, Never>?
    @State private var isExporting: Bool = false
    @State private var showShare: Bool = false
    @State private var exportURL: URL?

    private var candidates: [ProgressPhoto] {
        photoStore.photosForPose(selectedPose)
    }

    private let speedOptions: [(label: String, value: Double)] = [
        ("0.5s", 0.5),
        ("1s",   1.0),
        ("2s",   2.0),
    ]

    var body: some View {
        VStack(spacing: 0) {
            if candidates.count < 2 {
                insufficientView
            } else if isLoading {
                loadingView
            } else {
                timelapseContent
            }
        }
        .background(Color.black)
        .navigationTitle("Timelapse")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") {
                    stopPlayback()
                    dismiss()
                }
            }
            if candidates.count >= 2, !isLoading {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await exportVideo() }
                    } label: {
                        if isExporting {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "square.and.arrow.up")
                        }
                    }
                    .disabled(isExporting)
                }
            }
        }
        .sheet(isPresented: $showShare) {
            if let url = exportURL {
                ShareSheet(items: [url])
            }
        }
        .task { await loadFrames() }
        .onChange(of: selectedPose) { _, _ in
            stopPlayback()
            currentIndex = 0
            Task { await loadFrames() }
        }
        .onDisappear { stopPlayback() }
    }

    // MARK: - Timelapse Content

    private var timelapseContent: some View {
        VStack(spacing: Spacing.lg) {
            // Pose selector
            poseSelector
                .padding(.top, Spacing.sm)

            // Main frame
            ZStack {
                if !frames.isEmpty {
                    let idx = min(currentIndex, frames.count - 1)
                    Image(uiImage: frames[idx])
                        .resizable()
                        .scaledToFit()
                        .id(currentIndex) // force view identity change for animation
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: currentIndex)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            .padding(.horizontal, Spacing.md)

            // Date + weight overlay
            if !candidates.isEmpty {
                let photo = candidates[min(currentIndex, candidates.count - 1)]
                HStack {
                    Text(formatDate(photo.date))
                        .font(.appHeadline)
                        .foregroundStyle(.white)

                    if let wt = weightLabel(for: photo) {
                        Text("·")
                            .foregroundStyle(.white.opacity(0.5))
                        Text(wt)
                            .font(.appBody)
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
            }

            // Scrubber
            scrubber

            // Controls
            controlBar
                .padding(.bottom, Spacing.xxxl)
        }
    }

    // MARK: - Scrubber

    private var scrubber: some View {
        VStack(spacing: Spacing.xs) {
            // Slider
            Slider(
                value: Binding(
                    get: { Double(currentIndex) },
                    set: { newVal in
                        currentIndex = Int(newVal.rounded())
                    }
                ),
                in: 0...Double(max(1, candidates.count - 1)),
                step: 1
            )
            .tint(.white)
            .padding(.horizontal, Spacing.lg)

            // Frame counter
            HStack {
                Text("\(currentIndex + 1) / \(candidates.count)")
                    .font(.appCaption1)
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.6))
                Spacer()
                if let first = candidates.first, let last = candidates.last {
                    Text("\(formatShortDate(first.date)) → \(formatShortDate(last.date))")
                        .font(.appCaption2)
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
    }

    // MARK: - Control Bar

    private var controlBar: some View {
        HStack(spacing: Spacing.xl) {
            // Speed picker
            HStack(spacing: Spacing.xs) {
                ForEach(speedOptions, id: \.value) { opt in
                    Button {
                        frameDuration = opt.value
                    } label: {
                        Text(opt.label)
                            .font(.appCaption1)
                            .fontWeight(frameDuration == opt.value ? .semibold : .regular)
                            .foregroundStyle(frameDuration == opt.value ? .white : .white.opacity(0.5))
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xs)
                            .background(
                                frameDuration == opt.value
                                    ? Color.white.opacity(0.2)
                                    : Color.clear
                            )
                            .clipShape(Capsule())
                    }
                }
            }

            Spacer()

            // Play / Pause
            Button {
                togglePlayback()
            } label: {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.appTint, in: Circle())
            }

            Spacer()

            // Restart
            Button {
                stopPlayback()
                currentIndex = 0
            } label: {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 40, height: 40)
            }
            .disabled(!isPlaying && currentIndex == 0)
            .opacity(!isPlaying && currentIndex == 0 ? 0.3 : 1)
        }
        .padding(.horizontal, Spacing.lg)
    }

    // MARK: - Pose Selector

    private var poseSelector: some View {
        HStack(spacing: Spacing.sm) {
            ForEach(PhotoPose.allCases, id: \.self) { pose in
                let count = photoStore.photosForPose(pose).count
                Button {
                    selectedPose = pose
                } label: {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: pose.icon)
                            .font(.system(size: 12))
                        Text("\(pose.label) (\(count))")
                            .font(.appCaption1)
                            .fontWeight(selectedPose == pose ? .semibold : .regular)
                    }
                    .foregroundStyle(selectedPose == pose ? .white : .white.opacity(0.5))
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(
                        selectedPose == pose
                            ? Color.appTint.opacity(0.8)
                            : Color.white.opacity(0.15)
                    )
                    .clipShape(Capsule())
                }
                .disabled(count < 2)
                .opacity(count < 2 ? 0.4 : 1)
            }
        }
    }

    // MARK: - Loading / Insufficient

    private var loadingView: some View {
        VStack(spacing: Spacing.lg) {
            Spacer()
            ProgressView()
                .tint(.white)
                .scaleEffect(1.5)
            Text("Loading photos...")
                .font(.appBody)
                .foregroundStyle(.white.opacity(0.6))
            Spacer()
        }
    }

    private var insufficientView: some View {
        VStack(spacing: Spacing.lg) {
            Spacer()
            Image(systemName: "play.rectangle")
                .font(.system(size: 48))
                .foregroundStyle(.white.opacity(0.3))
            Text("Need More Photos")
                .font(.appTitle3)
                .foregroundStyle(.white)
            Text("Take at least 2 photos with the same pose to create a timelapse.")
                .font(.appBody)
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.xxxl)

            poseSelector
                .padding(.top, Spacing.md)

            Spacer()
        }
    }

    // MARK: - Playback

    private func togglePlayback() {
        if isPlaying {
            stopPlayback()
        } else {
            startPlayback()
        }
    }

    private func startPlayback() {
        guard frames.count > 1 else { return }
        isPlaying = true

        // If at end, restart
        if currentIndex >= frames.count - 1 {
            currentIndex = 0
        }

        playTask = Task {
            while !Task.isCancelled, currentIndex < frames.count - 1 {
                try? await Task.sleep(for: .milliseconds(Int(frameDuration * 1000)))
                if Task.isCancelled { break }
                currentIndex += 1
            }
            if !Task.isCancelled {
                isPlaying = false
            }
        }
    }

    private func stopPlayback() {
        playTask?.cancel()
        playTask = nil
        isPlaying = false
    }

    // MARK: - Frame Loading

    private func loadFrames() async {
        isLoading = true
        let photos = candidates

        // Load at reduced resolution for memory efficiency
        var loaded: [UIImage] = []
        for photo in photos {
            if let thumb = photoStore.loadThumbnail(for: photo, maxDimension: 800) {
                loaded.append(thumb)
            }
        }

        frames = loaded
        currentIndex = 0
        isLoading = false
    }

    // MARK: - Video Export

    private func exportVideo() async {
        guard frames.count >= 2 else { return }
        stopPlayback()
        isExporting = true

        let photos = candidates
        let logo = UIImage(named: "AppIcon")

        // Render each frame with date/weight overlay and watermark
        var composited: [UIImage] = []
        for (i, frame) in frames.enumerated() {
            let photo = photos[min(i, photos.count - 1)]
            let date = formatDate(photo.date)
            let weight = weightLabel(for: photo)
            composited.append(renderFrame(frame, date: date, weight: weight, logo: logo))
        }

        // Write to MP4
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("progress_timelapse_\(UUID().uuidString.prefix(8)).mp4")

        let success = await writeVideo(frames: composited, to: url, frameDuration: frameDuration)

        if success {
            exportURL = url
            showShare = true
        }
        isExporting = false
    }

    private func renderFrame(_ image: UIImage, date: String, weight: String?, logo: UIImage?) -> UIImage {
        let size = image.size
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            image.draw(at: .zero)

            // Semi-transparent bottom bar for text
            let barHeight: CGFloat = 60
            let barRect = CGRect(x: 0, y: size.height - barHeight, width: size.width, height: barHeight)
            UIColor.black.withAlphaComponent(0.5).setFill()
            ctx.fill(barRect)

            // Date text
            let dateAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 22, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            let dateStr = NSAttributedString(string: date, attributes: dateAttrs)
            let dateSize = dateStr.size()
            var textX: CGFloat = 16
            dateStr.draw(at: CGPoint(x: textX, y: size.height - barHeight + (barHeight - dateSize.height) / 2))
            textX += dateSize.width

            // Weight text
            if let weight {
                let weightAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 18, weight: .medium),
                    .foregroundColor: UIColor.white.withAlphaComponent(0.8),
                ]
                let sep = NSAttributedString(string: "  ·  ", attributes: weightAttrs)
                let sepSize = sep.size()
                sep.draw(at: CGPoint(x: textX, y: size.height - barHeight + (barHeight - sepSize.height) / 2))
                textX += sepSize.width

                let wtStr = NSAttributedString(string: weight, attributes: weightAttrs)
                let wtSize = wtStr.size()
                wtStr.draw(at: CGPoint(x: textX, y: size.height - barHeight + (barHeight - wtSize.height) / 2))
            }

            // Logo watermark (bottom-right)
            if let logo {
                let logoSize: CGFloat = 32
                let logoRect = CGRect(
                    x: size.width - logoSize - 12,
                    y: size.height - barHeight + (barHeight - logoSize) / 2,
                    width: logoSize, height: logoSize
                )
                ctx.cgContext.saveGState()
                ctx.cgContext.setAlpha(0.4)
                let path = UIBezierPath(roundedRect: logoRect, cornerRadius: 7)
                path.addClip()
                logo.draw(in: logoRect)
                ctx.cgContext.restoreGState()
            }
        }
    }

    private func writeVideo(frames: [UIImage], to url: URL, frameDuration: Double) async -> Bool {
        guard let first = frames.first else { return false }
        let size = CGSize(width: Int(first.size.width), height: Int(first.size.height))

        // Clean up any existing file
        try? FileManager.default.removeItem(at: url)

        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return false }

        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: size.width,
            AVVideoHeightKey: size.height,
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false

        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: size.width,
            kCVPixelBufferHeightKey as String: size.height,
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: attrs
        )

        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)

        let frameDurationCM = CMTime(seconds: frameDuration, preferredTimescale: 600)

        for (i, frame) in frames.enumerated() {
            let time = CMTime(value: Int64(i) * frameDurationCM.value, timescale: frameDurationCM.timescale)

            // Wait for ready
            while !input.isReadyForMoreMediaData {
                try? await Task.sleep(for: .milliseconds(10))
            }

            guard let buffer = pixelBuffer(from: frame, size: size) else { continue }
            adaptor.append(buffer, withPresentationTime: time)
        }

        input.markAsFinished()
        await writer.finishWriting()
        return writer.status == .completed
    }

    private func pixelBuffer(from image: UIImage, size: CGSize) -> CVPixelBuffer? {
        let width = Int(size.width)
        let height = Int(size.height)

        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault, width, height,
            kCVPixelFormatType_32ARGB, nil, &buffer
        )
        guard status == kCVReturnSuccess, let buf = buffer else { return nil }

        CVPixelBufferLockBaseAddress(buf, [])
        let data = CVPixelBufferGetBaseAddress(buf)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: data,
            width: width, height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        ) else {
            CVPixelBufferUnlockBaseAddress(buf, [])
            return nil
        }

        // Flip vertically (UIKit vs Core Graphics coordinate space)
        ctx.translateBy(x: 0, y: CGFloat(height))
        ctx.scaleBy(x: 1, y: -1)

        UIGraphicsPushContext(ctx)
        image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
        UIGraphicsPopContext()

        CVPixelBufferUnlockBaseAddress(buf, [])
        return buf
    }

    // MARK: - Helpers

    private func formatDate(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: dateStr) else { return dateStr }
        let display = DateFormatter()
        display.dateFormat = "MMM d, yyyy"
        return display.string(from: date)
    }

    private func formatShortDate(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: dateStr) else { return dateStr }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        return display.string(from: date)
    }

    private func weightLabel(for photo: ProgressPhoto) -> String? {
        guard let weightId = photo.linkedWeightEntryId,
              let entry = weightStore.entries.first(where: { $0.id == weightId })
        else { return nil }

        let isMetric = profileStore.profile?.preferredUnits != .imperial
        let value = isMetric ? entry.weightKg : entry.weightKg * 2.20462
        let unit = isMetric ? "kg" : "lbs"
        return String(format: "%.1f %@", value, unit)
    }
}
