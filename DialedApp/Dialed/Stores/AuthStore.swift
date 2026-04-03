import AuthenticationServices
import Foundation

// MARK: - Auth Response Types

struct AuthResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: AuthUser
}

struct AuthUser: Decodable, Sendable {
    let id: String
    let name: String
    let email: String?
}

struct TokenPair: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
}

// MARK: - AuthStore

@Observable @MainActor
final class AuthStore {
    static let shared = AuthStore()

    var isAuthenticated = false
    var currentUser: AuthUser?
    var isLoading = false
    var error: String?

    // Password reset state
    var resetEmail: String?
    var resetCodeSent = false
    var resetSuccess = false

    private init() {}

    // MARK: - Bootstrap (call on app launch)

    func bootstrap() async {
        guard KeychainService.load(key: "accessToken") != nil else {
            isAuthenticated = false
            return
        }

        // In release builds, verify Apple credential is still valid.
        // Skipped in debug because credential state can return .notFound
        // after Xcode reinstalls, wiping otherwise-valid tokens.
        #if !DEBUG
        if let appleUserId = KeychainService.load(key: "appleUserId") {
            let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: appleUserId)
            if state == .revoked || state == .notFound {
                KeychainService.deleteAll()
                clearPersistedUser()
                isAuthenticated = false
                return
            }
        }
        #endif

        // Restore persisted user info
        restoreUser()

        // Token exists (and Apple credential is still valid if applicable)
        isAuthenticated = true
    }

    // MARK: - Sign In with Apple

    func signInWithApple(_ authorization: ASAuthorization) async {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            self.error = "Failed to get Apple ID credential"
            return
        }

        isLoading = true
        error = nil

        var fullName: [String: String]?
        if let givenName = credential.fullName?.givenName {
            fullName = ["givenName": givenName]
            if let familyName = credential.fullName?.familyName {
                fullName?["familyName"] = familyName
            }
        }

        do {
            let response = try await APIClient.shared.signInWithApple(
                identityToken: identityToken, fullName: fullName
            )
            KeychainService.save(key: "accessToken", value: response.accessToken)
            KeychainService.save(key: "refreshToken", value: response.refreshToken)
            KeychainService.save(key: "appleUserId", value: credential.user)
            currentUser = response.user
            persistUser(response.user)
            isAuthenticated = true
        } catch let err as ApiError {
            self.error = err.message
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Email / Password

    func login(email: String, password: String) async {
        isLoading = true
        error = nil

        do {
            let response = try await APIClient.shared.login(email: email, password: password)
            KeychainService.save(key: "accessToken", value: response.accessToken)
            KeychainService.save(key: "refreshToken", value: response.refreshToken)
            currentUser = response.user
            persistUser(response.user)
            isAuthenticated = true
        } catch let err as ApiError {
            self.error = err.message
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func register(email: String, password: String, name: String) async {
        isLoading = true
        error = nil

        do {
            let response = try await APIClient.shared.register(
                email: email, password: password, name: name.isEmpty ? nil : name
            )
            KeychainService.save(key: "accessToken", value: response.accessToken)
            KeychainService.save(key: "refreshToken", value: response.refreshToken)
            currentUser = response.user
            persistUser(response.user)
            isAuthenticated = true
        } catch let err as ApiError {
            self.error = err.message
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Password Reset

    func forgotPassword(email: String) async {
        isLoading = true
        error = nil
        resetEmail = email
        resetCodeSent = false

        do {
            try await APIClient.shared.forgotPassword(email: email)
            resetCodeSent = true
        } catch let err as ApiError {
            self.error = err.message
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func resetPassword(code: String, newPassword: String) async {
        guard let email = resetEmail else {
            self.error = "No email set for password reset"
            return
        }

        isLoading = true
        error = nil
        resetSuccess = false

        do {
            try await APIClient.shared.resetPassword(email: email, code: code, newPassword: newPassword)
            resetSuccess = true
            resetEmail = nil
            resetCodeSent = false
        } catch let err as ApiError {
            self.error = err.message
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func clearResetState() {
        resetEmail = nil
        resetCodeSent = false
        resetSuccess = false
        error = nil
    }

    // MARK: - Token Refresh

    /// Attempts to refresh the access token. Returns true on success.
    func refreshTokenIfNeeded() async -> Bool {
        guard let refreshToken = KeychainService.load(key: "refreshToken") else {
            signOut()
            return false
        }

        do {
            let pair: TokenPair = try await APIClient.shared.refreshToken(refreshToken)
            KeychainService.save(key: "accessToken", value: pair.accessToken)
            KeychainService.save(key: "refreshToken", value: pair.refreshToken)
            return true
        } catch {
            signOut()
            return false
        }
    }

    // MARK: - Sign Out

    func signOut() {
        KeychainService.deleteAll()
        clearPersistedUser()
        isAuthenticated = false
        currentUser = nil
        resetStores()
    }

    // MARK: - Delete Account

    func deleteAccount() async {
        isLoading = true
        do {
            try await APIClient.shared.deleteAccount()
        } catch {
            // Best-effort — still clear local state
            #if DEBUG
            print("[AuthStore] Delete account error: \(error)")
            #endif
        }
        KeychainService.deleteAll()
        clearPersistedUser()
        isAuthenticated = false
        currentUser = nil
        isLoading = false
        resetStores()
    }

    // MARK: - Helpers

    private func resetStores() {
        DraftStore.shared.reset()
    }

    private func persistUser(_ user: AuthUser) {
        UserDefaults.standard.set(user.id, forKey: "currentUser.id")
        UserDefaults.standard.set(user.name, forKey: "currentUser.name")
        UserDefaults.standard.set(user.email, forKey: "currentUser.email")
    }

    private func restoreUser() {
        guard let id = UserDefaults.standard.string(forKey: "currentUser.id"),
              let name = UserDefaults.standard.string(forKey: "currentUser.name") else { return }
        currentUser = AuthUser(
            id: id,
            name: name,
            email: UserDefaults.standard.string(forKey: "currentUser.email")
        )
    }

    private func clearPersistedUser() {
        UserDefaults.standard.removeObject(forKey: "currentUser.id")
        UserDefaults.standard.removeObject(forKey: "currentUser.name")
        UserDefaults.standard.removeObject(forKey: "currentUser.email")
    }
}
