import SwiftUI

struct ForgotPasswordView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.xl) {
                    if authStore.resetSuccess {
                        successView
                    } else if authStore.resetCodeSent {
                        resetView
                    } else {
                        emailView
                    }
                }
                .padding(.horizontal, Spacing.xl)
                .padding(.top, Spacing.xl)
            }
            .navigationTitle("Reset Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        authStore.clearResetState()
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: - Step 1: Enter email

    private var emailView: some View {
        VStack(spacing: Spacing.md) {
            Text("Enter your email address and we'll send you a code to reset your password.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)

            Button {
                Task { await authStore.forgotPassword(email: email) }
            } label: {
                Text("Send Reset Code")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .cornerRadius(BorderRadius.md)
            }
            .disabled(email.isEmpty || authStore.isLoading)

            if authStore.isLoading {
                ProgressView()
            }

            if let error = authStore.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Step 2: Enter code + new password

    private var resetView: some View {
        VStack(spacing: Spacing.md) {
            Text("We sent a 6-digit code to **\(authStore.resetEmail ?? email)**. Enter it below with your new password.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            TextField("6-digit code", text: $code)
                .keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)

            SecureField("New password", text: $newPassword)
                .textContentType(.newPassword)
                .textFieldStyle(.roundedBorder)

            SecureField("Confirm password", text: $confirmPassword)
                .textContentType(.newPassword)
                .textFieldStyle(.roundedBorder)

            if !confirmPassword.isEmpty && newPassword != confirmPassword {
                Text("Passwords don't match")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button {
                Task { await authStore.resetPassword(code: code, newPassword: newPassword) }
            } label: {
                Text("Reset Password")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .cornerRadius(BorderRadius.md)
            }
            .disabled(code.isEmpty || newPassword.count < 6 || newPassword != confirmPassword || authStore.isLoading)

            if authStore.isLoading {
                ProgressView()
            }

            if let error = authStore.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button("Didn't get the code? Send again") {
                Task { await authStore.forgotPassword(email: authStore.resetEmail ?? email) }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }

    // MARK: - Success

    private var successView: some View {
        VStack(spacing: Spacing.lg) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(.green)

            Text("Password Reset!")
                .font(.title2.bold())

            Text("You can now sign in with your new password.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                authStore.clearResetState()
                dismiss()
            } label: {
                Text("Back to Sign In")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .cornerRadius(BorderRadius.md)
            }
        }
    }
}
