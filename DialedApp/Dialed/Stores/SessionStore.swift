import Foundation
import Observation

/// Manages paused Kitchen Mode sessions for the selected date.
@Observable @MainActor
final class SessionStore {
    static let shared = SessionStore()

    var sessionsForDate: [VoiceSessionSummary] = []
    var isLoading: Bool = false

    private init() {}

    // MARK: - Computed

    var pausedSessions: [VoiceSessionSummary] {
        sessionsForDate.filter { $0.status == .paused }
    }

    var hasPausedSessions: Bool { !pausedSessions.isEmpty }

    // MARK: - Actions

    func deleteSession(id: String, date: String) async {
        do {
            try await APIClient.shared.deleteSession(id: id)
            sessionsForDate.removeAll { $0.id == id }
        } catch {
            #if DEBUG
            print("[SessionStore] delete error: \(error)")
            #endif
        }
    }

    // MARK: - Fetch

    func fetch(date: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            sessionsForDate = try await APIClient.shared.getSessions(date: date)
        } catch {
            #if DEBUG
            print("[SessionStore] fetch error: \(error)")
            #endif
            sessionsForDate = []
        }
    }
}
