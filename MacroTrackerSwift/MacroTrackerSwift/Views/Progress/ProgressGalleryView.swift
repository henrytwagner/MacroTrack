import SwiftUI

// MARK: - Pose Filter

private enum PoseFilter: String, CaseIterable {
    case all, front, side, back

    var label: String {
        switch self {
        case .all:   "All"
        case .front: "Front"
        case .side:  "Side"
        case .back:  "Back"
        }
    }

    var pose: PhotoPose? {
        switch self {
        case .all:   nil
        case .front: .front
        case .side:  .side
        case .back:  .back
        }
    }
}

// MARK: - ProgressGalleryView

struct ProgressGalleryView: View {
    @Environment(ProgressPhotoStore.self) private var photoStore
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore

    @State private var selectedFilter: PoseFilter = .all
    @State private var showCamera = false
    @State private var showComparison = false
    @State private var showTimelapse = false
    @State private var selectedPhoto: ProgressPhoto?

    private var filteredPhotos: [ProgressPhoto] {
        let all = photoStore.photos.sorted { $0.date > $1.date } // newest first
        guard let pose = selectedFilter.pose else { return all }
        return all.filter { $0.pose == pose }
    }

    private let columns = [
        GridItem(.flexible(), spacing: Spacing.xs),
        GridItem(.flexible(), spacing: Spacing.xs),
        GridItem(.flexible(), spacing: Spacing.xs),
    ]

    var body: some View {
        VStack(spacing: 0) {
            if photoStore.photos.isEmpty {
                emptyState
            } else {
                filterBar
                photoGrid
            }
        }
        .background(Color.appBackground)
        .navigationTitle("Progress Photos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showCamera = true } label: {
                    Image(systemName: "camera.fill")
                }
            }

            if !photoStore.photos.isEmpty {
                ToolbarItem(placement: .secondaryAction) {
                    Button { showComparison = true } label: {
                        Label("Compare", systemImage: "square.split.2x1")
                    }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button { showTimelapse = true } label: {
                        Label("Timelapse", systemImage: "play.rectangle")
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            ProgressCameraView()
                .environment(photoStore)
                .environment(weightStore)
        }
        .sheet(isPresented: $showComparison) {
            NavigationStack {
                ProgressComparisonView()
                    .environment(photoStore)
                    .environment(weightStore)
                    .environment(profileStore)
            }
        }
        .fullScreenCover(isPresented: $showTimelapse) {
            NavigationStack {
                ProgressTimelapseView()
                    .environment(photoStore)
                    .environment(weightStore)
                    .environment(profileStore)
            }
        }
        .sheet(item: $selectedPhoto) { photo in
            NavigationStack {
                ProgressPhotoDetailView(photo: photo)
                    .environment(photoStore)
                    .environment(weightStore)
                    .environment(profileStore)
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        HStack(spacing: Spacing.sm) {
            ForEach(PoseFilter.allCases, id: \.self) { filter in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedFilter = filter
                    }
                } label: {
                    Text(filter.label)
                        .font(.appCaption1)
                        .fontWeight(selectedFilter == filter ? .semibold : .regular)
                        .foregroundStyle(selectedFilter == filter ? .white : Color.appTextSecondary)
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.sm)
                        .background(
                            selectedFilter == filter
                                ? Color.appTint
                                : Color.appSurfaceSecondary
                        )
                        .clipShape(Capsule())
                }
            }
            Spacer()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    // MARK: - Photo Grid

    private var photoGrid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: Spacing.xs) {
                ForEach(filteredPhotos) { photo in
                    Button {
                        selectedPhoto = photo
                    } label: {
                        ProgressPhotoThumbnail(
                            photo: photo,
                            weightLabel: weightLabel(for: photo)
                        )
                        .environment(photoStore)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Spacing.xs)
            .padding(.bottom, Spacing.xxxl)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: Spacing.lg) {
            Spacer()

            Image(systemName: "camera.viewfinder")
                .font(.system(size: 56))
                .foregroundStyle(Color.appTextTertiary)

            Text("No Progress Photos Yet")
                .font(.appTitle3)
                .foregroundStyle(Color.appText)

            Text("Take your first progress photo to start tracking your transformation.")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.xxxl)

            Button {
                showCamera = true
            } label: {
                Label("Take Photo", systemImage: "camera.fill")
                    .font(.appHeadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.xxl)
                    .padding(.vertical, Spacing.md)
                    .background(Color.appTint, in: RoundedRectangle(cornerRadius: BorderRadius.md))
            }
            .padding(.top, Spacing.md)

            Spacer()
        }
    }

    // MARK: - Helpers

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

// MARK: - ProgressPhotoDetailView

/// Full-screen detail for a single progress photo.
struct ProgressPhotoDetailView: View {
    let photo: ProgressPhoto
    @Environment(ProgressPhotoStore.self) private var photoStore
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(\.dismiss) private var dismiss

    @State private var image: UIImage?
    @State private var showDeleteConfirm = false

    var body: some View {
        VStack(spacing: 0) {
            // Photo
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(Spacing.sm)
            } else {
                Rectangle()
                    .fill(Color.appSurfaceSecondary)
                    .aspectRatio(3.0 / 4.0, contentMode: .fit)
                    .overlay { ProgressView() }
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
                    .padding(Spacing.sm)
            }

            // Info
            VStack(spacing: Spacing.sm) {
                HStack {
                    Label(formatFullDate(photo.date), systemImage: "calendar")
                        .font(.appBody)
                        .foregroundStyle(Color.appText)
                    Spacer()
                    Label(photo.pose.label, systemImage: photo.pose.icon)
                        .font(.appBody)
                        .foregroundStyle(Color.appTextSecondary)
                }

                if let weightId = photo.linkedWeightEntryId,
                   let entry = weightStore.entries.first(where: { $0.id == weightId }) {
                    let isMetric = profileStore.profile?.preferredUnits != .imperial
                    let value = isMetric ? entry.weightKg : entry.weightKg * 2.20462
                    let unit = isMetric ? "kg" : "lbs"
                    HStack {
                        Label(String(format: "%.1f %@", value, unit), systemImage: "scalemass")
                            .font(.appBody)
                            .foregroundStyle(Color.appText)
                        Spacer()
                    }
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)

            Spacer()
        }
        .background(Color.appBackground)
        .navigationTitle("Photo")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
            ToolbarItem(placement: .destructiveAction) {
                Button("Delete", role: .destructive) { showDeleteConfirm = true }
            }
        }
        .confirmationDialog("Delete this photo?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                photoStore.delete(id: photo.id)
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        }
        .task {
            image = photoStore.loadImage(for: photo)
        }
    }

    private func formatFullDate(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: dateStr) else { return dateStr }
        let display = DateFormatter()
        display.dateStyle = .long
        return display.string(from: date)
    }
}
