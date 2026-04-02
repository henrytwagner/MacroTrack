import Foundation

// MARK: - Progress Photo Types (local-only, no server counterpart)

enum PhotoPose: String, Codable, CaseIterable, Sendable {
    case front
    case side
    case back

    var label: String {
        switch self {
        case .front: "Front"
        case .side:  "Side"
        case .back:  "Back"
        }
    }

    var icon: String {
        switch self {
        case .front: "person.fill"
        case .side:  "person.fill.turn.right"
        case .back:  "person.fill.turn.left"
        }
    }
}

struct ProgressPhoto: Codable, Identifiable, Sendable {
    var id:                   String
    var date:                 String       // "yyyy-MM-dd"
    var pose:                 PhotoPose
    var filename:             String       // "progressphoto_{id}_{pose}_{date}.jpg"
    var linkedWeightEntryId:  String?
    var createdAt:            String       // ISO8601
}

struct ProgressPhotoManifest: Codable, Sendable {
    var photos: [ProgressPhoto]
}
