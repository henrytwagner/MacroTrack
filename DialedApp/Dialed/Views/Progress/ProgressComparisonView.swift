import SwiftUI

// MARK: - ProgressComparisonView

/// Side-by-side comparison of two progress photos, filtered by pose.
struct ProgressComparisonView: View {
    @Environment(ProgressPhotoStore.self) private var photoStore
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPose: PhotoPose = .front
    @State private var leftIndex: Int = 0
    @State private var rightIndex: Int = 0
    @State private var leftImage: UIImage?
    @State private var rightImage: UIImage?
    @State private var showShare = false
    @State private var shareImage: UIImage?

    private var candidates: [ProgressPhoto] {
        photoStore.photosForPose(selectedPose) // sorted oldest-first
    }

    var body: some View {
        VStack(spacing: 0) {
            if candidates.count < 2 {
                insufficientPhotosView
            } else {
                comparisonContent
            }
        }
        .background(Color.appBackground)
        .navigationTitle("Compare")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
            if candidates.count >= 2 {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        exportComparison()
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
        .onChange(of: selectedPose) { _, _ in
            resetIndices()
        }
        .sheet(isPresented: $showShare) {
            if let img = shareImage {
                ShareSheet(items: [img])
            }
        }
    }

    // MARK: - Comparison Content

    private var comparisonContent: some View {
        VStack(spacing: Spacing.md) {
            // Pose selector
            poseSelector
                .padding(.top, Spacing.sm)

            // Side-by-side photos
            HStack(spacing: Spacing.sm) {
                photoColumn(
                    photo: candidates[leftIndex],
                    image: leftImage,
                    index: $leftIndex,
                    label: "Before"
                )

                photoColumn(
                    photo: candidates[rightIndex],
                    image: rightImage,
                    index: $rightIndex,
                    label: "After"
                )
            }
            .padding(.horizontal, Spacing.md)

            Spacer()
        }
        .task { loadImages() }
        .onChange(of: leftIndex) { _, _ in loadImages() }
        .onChange(of: rightIndex) { _, _ in loadImages() }
    }

    // MARK: - Photo Column

    private func photoColumn(photo: ProgressPhoto, image: UIImage?,
                              index: Binding<Int>, label: String) -> some View {
        VStack(spacing: Spacing.sm) {
            // Label
            Text(label)
                .font(.appCaption1)
                .fontWeight(.semibold)
                .foregroundStyle(Color.appTextSecondary)

            // Photo
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Rectangle().fill(Color.appSurfaceSecondary)
                        .overlay { ProgressView() }
                }
            }
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))

            // Date label
            Text(formatDate(photo.date))
                .font(.appCaption1)
                .foregroundStyle(Color.appText)

            // Weight label
            if let wt = weightLabel(for: photo) {
                Text(wt)
                    .font(.appCaption2)
                    .foregroundStyle(Color.appTextSecondary)
            }

            // Date stepper
            HStack(spacing: Spacing.lg) {
                Button {
                    if index.wrappedValue > 0 { index.wrappedValue -= 1 }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.appTint)
                }
                .disabled(index.wrappedValue == 0)
                .opacity(index.wrappedValue == 0 ? 0.3 : 1)

                Text("\(index.wrappedValue + 1) / \(candidates.count)")
                    .font(.appCaption2)
                    .monospacedDigit()
                    .foregroundStyle(Color.appTextSecondary)

                Button {
                    if index.wrappedValue < candidates.count - 1 { index.wrappedValue += 1 }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.appTint)
                }
                .disabled(index.wrappedValue >= candidates.count - 1)
                .opacity(index.wrappedValue >= candidates.count - 1 ? 0.3 : 1)
            }
        }
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
                    .foregroundStyle(selectedPose == pose ? .white : Color.appTextSecondary)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(
                        selectedPose == pose ? Color.appTint : Color.appSurfaceSecondary
                    )
                    .clipShape(Capsule())
                }
                .disabled(count < 2)
                .opacity(count < 2 ? 0.5 : 1)
            }
        }
    }

    // MARK: - Insufficient Photos

    private var insufficientPhotosView: some View {
        VStack(spacing: Spacing.lg) {
            Spacer()

            Image(systemName: "square.split.2x1")
                .font(.system(size: 48))
                .foregroundStyle(Color.appTextTertiary)

            Text("Need More Photos")
                .font(.appTitle3)
                .foregroundStyle(Color.appText)

            Text("Take at least 2 photos with the same pose to compare them side by side.")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.xxxl)

            // Pose selector to try other poses
            poseSelector
                .padding(.top, Spacing.md)

            Spacer()
        }
    }

    // MARK: - Export

    private func exportComparison() {
        guard let left = leftImage, let right = rightImage else { return }
        let c = candidates
        let leftPhoto = c[min(leftIndex, c.count - 1)]
        let rightPhoto = c[min(rightIndex, c.count - 1)]

        let leftDate = formatDate(leftPhoto.date)
        let rightDate = formatDate(rightPhoto.date)
        let leftWeight = weightLabel(for: leftPhoto)
        let rightWeight = weightLabel(for: rightPhoto)

        shareImage = renderComparison(
            left: left, right: right,
            leftDate: leftDate, rightDate: rightDate,
            leftWeight: leftWeight, rightWeight: rightWeight
        )
        if shareImage != nil { showShare = true }
    }

    private func renderComparison(left: UIImage, right: UIImage,
                                   leftDate: String, rightDate: String,
                                   leftWeight: String?, rightWeight: String?) -> UIImage {
        let photoWidth: CGFloat = 400
        let photoHeight: CGFloat = photoWidth * 4.0 / 3.0
        let gap: CGFloat = 12
        let padding: CGFloat = 20
        let textHeight: CGFloat = 50
        let totalWidth = padding + photoWidth + gap + photoWidth + padding
        let totalHeight = padding + textHeight + 8 + photoHeight + 8 + textHeight + padding
        let size = CGSize(width: totalWidth, height: totalHeight)

        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            // Background
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))

            let leftX = padding
            let rightX = padding + photoWidth + gap
            let photoY = padding + textHeight + 8

            // "Before" / "After" labels
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .semibold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.6),
            ]
            "Before".draw(at: CGPoint(x: leftX, y: padding), withAttributes: labelAttrs)
            "After".draw(at: CGPoint(x: rightX, y: padding), withAttributes: labelAttrs)

            // Date labels
            let dateAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 16, weight: .bold),
                .foregroundColor: UIColor.white,
            ]
            leftDate.draw(at: CGPoint(x: leftX, y: padding + 18), withAttributes: dateAttrs)
            rightDate.draw(at: CGPoint(x: rightX, y: padding + 18), withAttributes: dateAttrs)

            // Photos
            let leftRect = CGRect(x: leftX, y: photoY, width: photoWidth, height: photoHeight)
            let rightRect = CGRect(x: rightX, y: photoY, width: photoWidth, height: photoHeight)

            let path1 = UIBezierPath(roundedRect: leftRect, cornerRadius: 12)
            path1.addClip()
            drawFilling(left, in: leftRect)
            ctx.cgContext.resetClip()

            let path2 = UIBezierPath(roundedRect: rightRect, cornerRadius: 12)
            path2.addClip()
            drawFilling(right, in: rightRect)
            ctx.cgContext.resetClip()

            // Weight labels below photos
            let weightAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .medium),
                .foregroundColor: UIColor.white.withAlphaComponent(0.7),
            ]
            let weightY = photoY + photoHeight + 8
            if let lw = leftWeight { lw.draw(at: CGPoint(x: leftX, y: weightY), withAttributes: weightAttrs) }
            if let rw = rightWeight { rw.draw(at: CGPoint(x: rightX, y: weightY), withAttributes: weightAttrs) }

            // Logo watermark (bottom-right)
            if let logo = UIImage(named: "AppIcon") {
                let logoSize: CGFloat = 36
                let logoRect = CGRect(
                    x: totalWidth - padding - logoSize,
                    y: totalHeight - padding - logoSize,
                    width: logoSize, height: logoSize
                )
                ctx.cgContext.setAlpha(0.3)
                let logoPath = UIBezierPath(roundedRect: logoRect, cornerRadius: 8)
                logoPath.addClip()
                logo.draw(in: logoRect)
                ctx.cgContext.resetClip()
                ctx.cgContext.setAlpha(1.0)
            }
        }
    }

    private func drawFilling(_ image: UIImage, in rect: CGRect) {
        let imgW = image.size.width
        let imgH = image.size.height
        let scale = max(rect.width / imgW, rect.height / imgH)
        let drawW = imgW * scale
        let drawH = imgH * scale
        let drawX = rect.midX - drawW / 2
        let drawY = rect.midY - drawH / 2
        image.draw(in: CGRect(x: drawX, y: drawY, width: drawW, height: drawH))
    }

    // MARK: - Helpers

    private func resetIndices() {
        let count = candidates.count
        leftIndex = 0
        rightIndex = max(0, count - 1)
        loadImages()
    }

    private func loadImages() {
        let c = candidates
        guard !c.isEmpty else {
            leftImage = nil
            rightImage = nil
            return
        }
        let li = min(leftIndex, c.count - 1)
        let ri = min(rightIndex, c.count - 1)
        leftImage = photoStore.loadImage(for: c[li])
        rightImage = photoStore.loadImage(for: c[ri])
    }

    private func formatDate(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: dateStr) else { return dateStr }
        let display = DateFormatter()
        display.dateFormat = "MMM d, yyyy"
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
