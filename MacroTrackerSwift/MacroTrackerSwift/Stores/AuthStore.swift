import Foundation
import AuthenticationServices

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

        // If signed in via Apple, verify the credential hasn't been revoked
        if let appleUserId = KeychainService.load(key: "appleUserId") {
            do {
                let state = try await ASAuthorizationAppleIDProvider()
                    .credentialState(forUserID: appleUserId)

                switch state {
                case .revoked, .notFound:
                    KeychainService.deleteAll()
                    isAuthenticated = false
                    return
                default:
                    break
                }
            } catch {
                // Network error checking credential state — assume still valid
            }
        }

        // Token exists (and Apple credential is still valid if applicable)
        isAuthenticated = true
    }

    // MARK: - Sign In with Apple

    func signInWithApple(_ authorization: ASAuthorization) async {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            self.error = "Failed to get Apple identity token"
            return
        }

        // Persist Apple user ID immediately (Apple only provides name/email on first auth)
        KeychainService.save(key: "appleUserId", value: credential.user)

        isLoading = true
        error = nil

        do {
            let fullName: [String: String]? = {
                guard let given = credential.fullName?.givenName else { return nil }
                var name: [String: String] = ["givenName": given]
                if let family = credential.fullName?.familyName {
                    name["familyName"] = family
                }
                return name
            }()

            let response: AuthResponse = try await APIClient.shared.signInWithApple(
                identityToken: identityToken,
                fullName: fullName
            )

            KeychainService.save(key: "accessToken", value: response.accessToken)
            KeychainService.save(key: "refreshToken", value: response.refreshToken)
            currentUser = response.user
            isAuthenticated = true
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
        isAuthenticated = false
        currentUser = nil
        isLoading = false
        resetStores()
    }

    // MARK: - Helpers

    private func resetStores() {
        DraftStore.shared.reset()
    }
}
