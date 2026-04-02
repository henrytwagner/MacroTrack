import SwiftUI
import AVFoundation

// MARK: - ProgressCameraView

/// Full-screen camera with ghost overlay for consistent progress photos.
/// The ghost shows a previous photo at adjustable opacity so the user
/// can align their pose to match earlier shots.
struct ProgressCameraView: View {
    @Environment(ProgressPhotoStore.self) private var photoStore
    @Environment(WeightStore.self) private var weightStore
    @Environment(\.dismiss) private var dismiss

    /// Optional weight entry ID to link the captured photo to.
    var linkedWeightEntryId: String? = nil

    @State private var cameraSession = ProgressCameraSession()
    @State private var selectedPose: PhotoPose = .front
    @State private var ghostOpacity: Double = 0.3
    @State private var showGhost: Bool = true
    @State private var ghostPhoto: ProgressPhoto?
    @State private var ghostImage: UIImage?
    @State private var ghostIndex: Int = 0

    // Timer
    @State private var timerDuration: Int = 0       // 0 = instant, 3, 5, 10
    @State private var countdownRemaining: Int = 0  // actively counting down
    @State private var isCountingDown: Bool = false
    @State private var countdownTask: Task<Void, Never>?

    // Capture flow
    @State private var capturedImage: UIImage?
    @State private var isReviewing: Bool = false
    @State private var isSaving: Bool = false
    @State private var permissionDenied: Bool = false

    private var todayString: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }

    var body: some View {
        GeometryReader { outerGeo in
            let insets = outerGeo.safeAreaInsets
            ZStack {
                Color.black.ignoresSafeArea()

                if permissionDenied {
                    permissionDeniedView
                } else if isReviewing, let image = capturedImage {
                    reviewView(image: image, insets: insets)
                } else {
                    cameraView(insets: insets)
                }
            }
        }
        .statusBarHidden(false)
        .task {
            let granted = await cameraSession.requestPermission()
            if granted {
                cameraSession.start()
                updateGhost()
            } else {
                permissionDenied = true
            }
        }
        .onDisappear {
            cancelCountdown()
            cameraSession.stop()
        }
    }

    // MARK: - Camera View

    private func cameraView(insets: EdgeInsets) -> some View {
        GeometryReader { geo in
            ZStack {
                // Layer 1: Live camera preview
                KitchenCameraPreview(session: cameraSession.captureSession)

                // Layer 2: Ghost overlay
                if showGhost, let ghostImage {
                    Image(uiImage: ghostImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .opacity(ghostOpacity)
                        .allowsHitTesting(false)
                }

                // Layer 3: Countdown overlay
                if isCountingDown {
                    countdownOverlay
                }

                // Layer 4: UI controls (hidden during countdown)
                if !isCountingDown {
                    VStack(spacing: 0) {
                        topBar
                            .padding(.top, insets.top + Spacing.sm)
                        Spacer()
                        bottomControls
                            .padding(.bottom, insets.bottom + Spacing.md)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
    }

    // MARK: - Countdown Overlay

    private var countdownOverlay: some View {
        ZStack {
            // Dim background slightly
            Color.black.opacity(0.3)
                .ignoresSafeArea()
                .allowsHitTesting(false)

            VStack(spacing: Spacing.lg) {
                Text("\(countdownRemaining)")
                    .font(.system(size: 120, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.3), value: countdownRemaining)

                Button {
                    cancelCountdown()
                } label: {
                    Text("Cancel")
                        .font(.appHeadline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.xxl)
                        .padding(.vertical, Spacing.md)
                        .background(.ultraThinMaterial, in: Capsule())
                }
            }
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        VStack(spacing: Spacing.md) {
            HStack {
                // Close button
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial, in: Circle())
                }

                Spacer()

                // Timer selector
                timerButton

                // Camera flip
                Button { cameraSession.switchCamera() } label: {
                    Image(systemName: "camera.rotate")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial, in: Circle())
                }
            }
            .padding(.horizontal, Spacing.lg)

            // Pose selector
            poseSelector
        }
    }

    private var poseSelector: some View {
        HStack(spacing: Spacing.sm) {
            ForEach(PhotoPose.allCases, id: \.self) { pose in
                Button {
                    selectedPose = pose
                    ghostIndex = 0
                    updateGhost()
                } label: {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: pose.icon)
                            .font(.system(size: 13))
                        Text(pose.label)
                            .font(.appCaption1)
                            .fontWeight(selectedPose == pose ? .semibold : .regular)
                    }
                    .foregroundStyle(selectedPose == pose ? .white : .white.opacity(0.6))
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(
                        selectedPose == pose
                            ? Color.appTint.opacity(0.8)
                            : Color.white.opacity(0.15)
                    )
                    .clipShape(Capsule())
                }
            }
        }
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: Spacing.md) {
            // Ghost navigation + toggle
            if !ghostCandidates.isEmpty {
                ghostControls
            }

            // Opacity slider (only when ghost is visible)
            if showGhost, ghostImage != nil {
                opacitySlider
            }

            // Shutter + actions row
            shutterRow
        }
        .padding(.horizontal, Spacing.lg)
    }

    private var ghostControls: some View {
        HStack(spacing: Spacing.md) {
            // Toggle ghost
            Button {
                showGhost.toggle()
            } label: {
                Image(systemName: showGhost ? "eye.fill" : "eye.slash.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial, in: Circle())
            }

            if showGhost {
                // Previous
                Button {
                    cycleGhost(direction: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .disabled(ghostCandidates.count <= 1)
                .opacity(ghostCandidates.count <= 1 ? 0.4 : 1)

                // Ghost date label
                if let ghost = ghostPhoto {
                    Text(formatGhostLabel(ghost))
                        .font(.appCaption1)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.xs)
                        .background(.ultraThinMaterial, in: Capsule())
                }

                // Next
                Button {
                    cycleGhost(direction: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .disabled(ghostCandidates.count <= 1)
                .opacity(ghostCandidates.count <= 1 ? 0.4 : 1)
            }

            Spacer()
        }
    }

    private var opacitySlider: some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: "circle.dotted")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))

            Slider(value: $ghostOpacity, in: 0.05...0.5, step: 0.05)
                .tint(.white)

            Image(systemName: "circle.fill")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(.horizontal, Spacing.sm)
    }

    // MARK: - Timer

    private let timerOptions: [Int] = [0, 3, 5, 10]

    private var timerButton: some View {
        Menu {
            ForEach(timerOptions, id: \.self) { seconds in
                Button {
                    timerDuration = seconds
                } label: {
                    HStack {
                        Text(seconds == 0 ? "Off" : "\(seconds)s")
                        if timerDuration == seconds {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: "timer")
                    .font(.system(size: 16, weight: .semibold))
                if timerDuration > 0 {
                    Text("\(timerDuration)s")
                        .font(.appCaption2)
                        .fontWeight(.bold)
                }
            }
            .foregroundStyle(timerDuration > 0 ? Color.appTint : .white)
            .frame(width: timerDuration > 0 ? 56 : 40, height: 40)
            .background(.ultraThinMaterial, in: Capsule())
        }
    }

    private var shutterRow: some View {
        HStack {
            // Photo count badge
            let count = photoStore.photosForPose(selectedPose).count
            Text("\(count)")
                .font(.appCaption1)
                .fontWeight(.semibold)
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(.ultraThinMaterial, in: Circle())

            Spacer()

            // Shutter button
            Button {
                handleShutterTap()
            } label: {
                ZStack {
                    Circle()
                        .fill(.white)
                        .frame(width: 72, height: 72)
                    Circle()
                        .stroke(.white, lineWidth: 4)
                        .frame(width: 80, height: 80)
                }
            }

            Spacer()

            // Placeholder for symmetry
            Color.clear.frame(width: 40, height: 40)
        }
    }

    // MARK: - Review View

    private func reviewView(image: UIImage, insets: EdgeInsets) -> some View {
        GeometryReader { geo in
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()

                VStack {
                    // Close button (top-left)
                    HStack {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 40, height: 40)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        Spacer()
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, insets.top + Spacing.sm)

                    Spacer()

                    HStack(spacing: Spacing.md) {
                        // Retake
                        Button {
                            capturedImage = nil
                            isReviewing = false
                        } label: {
                            Text("Retake")
                                .font(.appHeadline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Spacing.md)
                                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: BorderRadius.md))
                        }

                        // Use Photo
                        Button {
                            savePhoto(image)
                        } label: {
                            Text("Use Photo")
                                .font(.appHeadline)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, Spacing.md)
                                .background(Color.appTint, in: RoundedRectangle(cornerRadius: BorderRadius.md))
                        }
                        .disabled(isSaving)
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, insets.bottom + Spacing.md)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
    }

    // MARK: - Permission Denied

    private var permissionDeniedView: some View {
        VStack(spacing: Spacing.lg) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundStyle(Color.appTextSecondary)

            Text("Camera Access Required")
                .font(.appTitle3)
                .foregroundStyle(.white)

            Text("Enable camera access in Settings to take progress photos.")
                .font(.appBody)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)

            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .font(.appHeadline)
            .foregroundStyle(Color.appTint)
            .padding(.top, Spacing.md)

            Button("Close") { dismiss() }
                .font(.appBody)
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(Spacing.xxxl)
    }

    // MARK: - Ghost Logic

    private var ghostCandidates: [ProgressPhoto] {
        photoStore.photosForPose(selectedPose)
    }

    private func updateGhost() {
        let candidates = ghostCandidates
        guard !candidates.isEmpty else {
            ghostPhoto = nil
            ghostImage = nil
            return
        }

        let idx = min(ghostIndex, candidates.count - 1)
        // Default: most recent = last in sorted array
        let reversedIdx = candidates.count - 1 - idx
        let photo = candidates[max(0, reversedIdx)]
        ghostPhoto = photo
        ghostImage = photoStore.loadImage(for: photo)
    }

    private func cycleGhost(direction: Int) {
        let count = ghostCandidates.count
        guard count > 1 else { return }
        ghostIndex = (ghostIndex + direction + count) % count
        updateGhost()
    }

    private func formatGhostLabel(_ photo: ProgressPhoto) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: photo.date) else { return photo.date }

        let days = Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 0
        if days == 0 { return "Today" }
        if days == 1 { return "Yesterday" }
        if days < 7 { return "\(days) days ago" }
        if days < 30 {
            let weeks = days / 7
            return weeks == 1 ? "1 week ago" : "\(weeks) weeks ago"
        }
        let months = days / 30
        if months < 12 {
            return months == 1 ? "1 month ago" : "\(months) months ago"
        }

        let displayFmt = DateFormatter()
        displayFmt.dateFormat = "MMM d, yyyy"
        return displayFmt.string(from: date)
    }

    // MARK: - Capture & Save

    private func handleShutterTap() {
        if timerDuration == 0 {
            Task { await capturePhoto() }
        } else {
            startCountdown()
        }
    }

    private func startCountdown() {
        countdownRemaining = timerDuration
        isCountingDown = true

        countdownTask = Task {
            while countdownRemaining > 0, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
                countdownRemaining -= 1
            }
            if !Task.isCancelled {
                isCountingDown = false
                await capturePhoto()
            }
        }
    }

    private func cancelCountdown() {
        countdownTask?.cancel()
        countdownTask = nil
        isCountingDown = false
        countdownRemaining = 0
    }

    private func capturePhoto() async {
        guard let raw = await cameraSession.capturePhoto() else { return }
        let isFront = cameraSession.cameraPosition == .front
        // Downscale + mirror in one pass to avoid OOM on 12MP captures.
        capturedImage = processCapture(raw, mirror: isFront)
        isReviewing = true
    }

    /// Downscale to max 2000px and optionally mirror horizontally, all in one render pass.
    private func processCapture(_ image: UIImage, mirror: Bool) -> UIImage {
        let maxDim: CGFloat = 2000
        let w = image.size.width
        let h = image.size.height
        let scale = min(1.0, maxDim / max(w, h))
        let newSize = CGSize(width: w * scale, height: h * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { ctx in
            if mirror {
                ctx.cgContext.translateBy(x: newSize.width, y: 0)
                ctx.cgContext.scaleBy(x: -1, y: 1)
            }
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    private func savePhoto(_ image: UIImage) {
        isSaving = true
        let photo = photoStore.save(
            image,
            pose: selectedPose,
            date: todayString,
            linkedWeightEntryId: linkedWeightEntryId
        )
        isSaving = false

        if photo != nil {
            // Reset for next capture
            capturedImage = nil
            isReviewing = false
            ghostIndex = 0
            updateGhost()
        }
    }
}
