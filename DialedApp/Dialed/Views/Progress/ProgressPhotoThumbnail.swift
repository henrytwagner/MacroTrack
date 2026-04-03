import SwiftUI

// MARK: - ProgressPhotoThumbnail

/// Reusable grid cell that async-loads a thumbnail from disk.
/// Shows date label, optional weight badge, and pose icon.
struct ProgressPhotoThumbnail: View {
    let photo: ProgressPhoto
    let weightLabel: String?

    @Environment(ProgressPhotoStore.self) private var photoStore
    @State private var thumbnail: UIImage?

    var body: some View {
        ZStack(alignment: .bottom) {
            // Thumbnail
            Group {
                if let thumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                } else {
                    Rectangle()
                        .fill(Color.appSurfaceSecondary)
                        .overlay {
                            ProgressView()
                                .tint(Color.appTextTertiary)
                        }
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity)
            .aspectRatio(3.0 / 4.0, contentMode: .fill)
            .clipped()

            // Bottom overlay: date + weight
            VStack(spacing: 2) {
                Text(formatDate(photo.date))
                    .font(.appCaption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)

                if let weightLabel {
                    Text(weightLabel)
                        .font(.appCaption2)
                        .foregroundStyle(.white.opacity(0.8))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.xs)
            .background(
                LinearGradient(
                    colors: [.black.opacity(0.6), .clear],
                    startPoint: .bottom,
                    endPoint: .top
                )
            )

            // Pose icon badge (top-left)
            VStack {
                HStack {
                    Image(systemName: photo.pose.icon)
                        .font(.system(size: 10))
                        .foregroundStyle(.white)
                        .padding(4)
                        .background(.ultraThinMaterial, in: Circle())
                        .padding(Spacing.xs)
                    Spacer()
                }
                Spacer()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
        .task {
            thumbnail = photoStore.loadThumbnail(for: photo, maxDimension: 400)
        }
    }

    private func formatDate(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: dateStr) else { return dateStr }
        let display = DateFormatter()
        display.dateFormat = "MMM d"
        return display.string(from: date)
    }
}
