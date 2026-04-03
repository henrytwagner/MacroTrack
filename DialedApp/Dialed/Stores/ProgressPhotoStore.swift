import Foundation
import Observation
import UIKit
import ImageIO

@Observable @MainActor
final class ProgressPhotoStore {
    static let shared = ProgressPhotoStore()

    var photos: [ProgressPhoto] = []
    var isLoading: Bool = false

    private init() {
        load()
    }

    // MARK: - Computed

    /// All photos for a given pose, sorted oldest-first.
    func photosForPose(_ pose: PhotoPose) -> [ProgressPhoto] {
        photos.filter { $0.pose == pose }.sorted { $0.date < $1.date }
    }

    /// Most recent photo for the given pose.
    func latestPhoto(for pose: PhotoPose) -> ProgressPhoto? {
        photosForPose(pose).last
    }

    /// Photos closest to a target date for a pose (for ghost cycling).
    func photo(for pose: PhotoPose, closestTo targetDate: String) -> ProgressPhoto? {
        let candidates = photosForPose(pose)
        guard !candidates.isEmpty else { return nil }
        return candidates.min(by: { abs(daysBetween($0.date, targetDate)) < abs(daysBetween($1.date, targetDate)) })
    }

    // MARK: - Directory

    var photoDirectory: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return docs.appendingPathComponent("ProgressPhotos", isDirectory: true)
    }

    private var manifestURL: URL {
        photoDirectory.appendingPathComponent("progress_manifest.json")
    }

    // MARK: - Persistence

    func load() {
        ensureDirectory()
        guard FileManager.default.fileExists(atPath: manifestURL.path) else { return }
        do {
            let data = try Data(contentsOf: manifestURL)
            let manifest = try JSONDecoder().decode(ProgressPhotoManifest.self, from: data)
            photos = manifest.photos.sorted { $0.date < $1.date }
        } catch {
            photos = []
        }
    }

    private func persist() {
        let manifest = ProgressPhotoManifest(photos: photos)
        do {
            let data = try JSONEncoder().encode(manifest)
            try data.write(to: manifestURL, options: .atomic)
        } catch {
            // Non-critical — will re-sync on next load
        }
    }

    private func ensureDirectory() {
        let fm = FileManager.default
        if !fm.fileExists(atPath: photoDirectory.path) {
            try? fm.createDirectory(at: photoDirectory, withIntermediateDirectories: true)
        }
    }

    // MARK: - Save

    @discardableResult
    func save(_ image: UIImage, pose: PhotoPose, date: String, linkedWeightEntryId: String? = nil) -> ProgressPhoto? {
        ensureDirectory()

        let id = UUID().uuidString
        let filename = "progressphoto_\(id)_\(pose.rawValue)_\(date).jpg"
        let fileURL = photoDirectory.appendingPathComponent(filename)

        guard let jpegData = image.jpegData(compressionQuality: 0.85) else { return nil }

        do {
            try jpegData.write(to: fileURL, options: .atomic)
        } catch {
            return nil
        }

        let now = ISO8601DateFormatter().string(from: Date())
        let photo = ProgressPhoto(
            id: id,
            date: date,
            pose: pose,
            filename: filename,
            linkedWeightEntryId: linkedWeightEntryId,
            createdAt: now
        )

        photos.append(photo)
        photos.sort { $0.date < $1.date }
        persist()
        return photo
    }

    // MARK: - Delete

    func delete(id: String) {
        guard let photo = photos.first(where: { $0.id == id }) else { return }
        let fileURL = photoDirectory.appendingPathComponent(photo.filename)
        try? FileManager.default.removeItem(at: fileURL)
        photos.removeAll { $0.id == id }
        persist()
    }

    // MARK: - Link Weight

    func linkWeight(photoId: String, weightEntryId: String) {
        guard let idx = photos.firstIndex(where: { $0.id == photoId }) else { return }
        photos[idx].linkedWeightEntryId = weightEntryId
        persist()
    }

    // MARK: - Image Loading

    func imageURL(for photo: ProgressPhoto) -> URL {
        photoDirectory.appendingPathComponent(photo.filename)
    }

    func loadImage(for photo: ProgressPhoto) -> UIImage? {
        let url = imageURL(for: photo)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    /// Load a downsampled thumbnail for memory-efficient display in grids and timelapse.
    func loadThumbnail(for photo: ProgressPhoto, maxDimension: CGFloat = 400) -> UIImage? {
        let url = imageURL(for: photo)
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]

        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    // MARK: - Helpers

    /// Approximate day difference between two "yyyy-MM-dd" strings.
    private func daysBetween(_ a: String, _ b: String) -> Int {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let da = f.date(from: a), let db = f.date(from: b) else { return Int.max }
        return Calendar.current.dateComponents([.day], from: da, to: db).day ?? Int.max
    }
}
