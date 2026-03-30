import Foundation
import Observation

/// Manages the user profile. Port of mobile/stores/profileStore.ts.
@Observable @MainActor
final class ProfileStore {
    static let shared = ProfileStore()

    var profile:   UserProfile? = nil
    var isLoading: Bool = false
    var error:     String? = nil

    private init() {}

    func fetch() async {
        isLoading = true
        error = nil
        do {
            profile   = try await APIClient.shared.getProfile()
            isLoading = false
        } catch is CancellationError {
            // ignore
        } catch {
            isLoading = false
            self.error = error.localizedDescription
        }
    }

    func save(_ updated: UserProfile) async {
        isLoading = true
        error = nil
        do {
            profile   = try await APIClient.shared.updateProfile(updated)
            isLoading = false
        } catch {
            isLoading = false
            self.error = error.localizedDescription
        }
    }
}
