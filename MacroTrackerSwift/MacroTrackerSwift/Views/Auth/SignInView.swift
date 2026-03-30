import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @Environment(AuthStore.self) private var authStore

    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var showForgotPassword = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                Spacer().frame(height: 60)

                // Branding
                VStack(spacing: Spacing.md) {
                    Image(systemName: "fork.knife.circle.fill")
                        .font(.system(size: 72))
                        .foregroundStyle(Color.accentColor)

                    Text("MacroTrack")
                        .font(.largeTitle.bold())

                    Text("Voice-first macro tracking")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer().frame(height: Spacing.xl)

                // Email / password form
                VStack(spacing: Spacing.md) {
                    if isRegistering {
                        TextField("Name", text: $name)
                            .textContentType(.name)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                    }

                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)

                    SecureField("Password", text: $password)
                        .textContentType(isRegistering ? .newPassword : .password)
                        .textFieldStyle(.roundedBorder)

                    Button {
                        Task {
                            if isRegistering {
                                await authStore.register(email: email, password: password, name: name)
                            } else {
                                await authStore.login(email: email, password: password)
                            }
                        }
                    } label: {
                        Text(isRegistering ? "Create Account" : "Sign In")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Color.accentColor)
                            .foregroundStyle(.white)
                            .cornerRadius(BorderRadius.md)
                    }
                    .disabled(email.isEmpty || password.isEmpty || authStore.isLoading)

                    HStack {
                        Button {
                            withAnimation { isRegistering.toggle() }
                            authStore.error = nil
                        } label: {
                            Text(isRegistering
                                 ? "Already have an account? Sign in"
                                 : "Don't have an account? Create one")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }

                        if !isRegistering {
                            Spacer()
                            Button("Forgot password?") {
                                showForgotPassword = true
                            }
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, Spacing.xl)

                // Divider
                HStack {
                    Rectangle().frame(height: 1).foregroundStyle(Color.secondary.opacity(0.3))
                    Text("or")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Rectangle().frame(height: 1).foregroundStyle(Color.secondary.opacity(0.3))
                }
                .padding(.horizontal, Spacing.xl)

                // Sign in with Apple
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        Task {
                            await authStore.signInWithApple(authorization)
                        }
                    case .failure(let error):
                        authStore.error = error.localizedDescription
                    }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 50)
                .cornerRadius(BorderRadius.md)
                .padding(.horizontal, Spacing.xl)

                // Status
                if authStore.isLoading {
                    ProgressView()
                }

                if let error = authStore.error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Spacing.xl)
                }

                Spacer()
            }
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordView()
                .environment(authStore)
        }
    }
}
