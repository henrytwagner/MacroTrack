import SwiftUI

/// Page 0: Bold hero welcome screen inspired by the website's gradient-heavy dark aesthetic.
struct OnboardingWelcomePage: View {
    var vm: OnboardingViewModel
    @Environment(AuthStore.self) private var authStore

    @State private var animateGradient = false
    @State private var showContent = false

    var body: some View {
        ZStack {
            // Atmospheric glow background
            backgroundGlows

            VStack(spacing: Spacing.xxl) {
                Spacer()

                // App icon with multi-color glow
                ZStack {
                    // Glow layers behind the icon
                    Circle()
                        .fill(Color.caloriesAccent.opacity(0.15))
                        .frame(width: 180, height: 180)
                        .blur(radius: 40)
                    Circle()
                        .fill(Color.proteinAccent.opacity(0.1))
                        .frame(width: 160, height: 160)
                        .blur(radius: 50)
                        .offset(x: 20, y: -10)
                    Circle()
                        .fill(Color.fatAccent.opacity(0.08))
                        .frame(width: 140, height: 140)
                        .blur(radius: 45)
                        .offset(x: -20, y: 15)

                    if let uiImage = UIImage(named: "AppIcon") {
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 120, height: 120)
                            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                            .shadow(color: Color.caloriesAccent.opacity(0.2), radius: 20, y: 4)
                            .shadow(color: Color.proteinAccent.opacity(0.15), radius: 30, y: 8)
                    }
                }
                .opacity(showContent ? 1 : 0)
                .offset(y: showContent ? 0 : 20)

                // Title
                Text("Dialed")
                    .font(.system(size: 40, weight: .bold, design: .default))
                    .foregroundStyle(Color.appText)
                    .opacity(showContent ? 1 : 0)
                    .offset(y: showContent ? 0 : 15)

                // Tagline
                Text("Voice-first macro tracking\nthat keeps up with your life.")
                    .font(.appTitle3)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)
                    .opacity(showContent ? 1 : 0)
                    .offset(y: showContent ? 0 : 15)

                // Macro color bar signature
                macroColorBars
                    .opacity(showContent ? 1 : 0)

                Spacer()

                // Sign in link for existing users
                Button {
                    authStore.signOut()
                } label: {
                    Text("Already have an account? Sign in")
                        .font(.appFootnote)
                        .foregroundStyle(Color.appTextSecondary)
                }
                .opacity(showContent ? 1 : 0)
                .padding(.bottom, Spacing.md)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Spacing.xl)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8).delay(0.1)) {
                showContent = true
            }
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: true)) {
                animateGradient = true
            }
        }
    }

    // MARK: - Background Glows

    private var backgroundGlows: some View {
        ZStack {
            // Top-left warm glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.caloriesAccent.opacity(0.08), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .offset(x: -120, y: -200)

            // Bottom-right cool glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.proteinAccent.opacity(0.06), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 200
                    )
                )
                .frame(width: 400, height: 400)
                .offset(x: 120, y: 200)
        }
    }

    // MARK: - Macro Color Bars (website signature)

    private var macroColorBars: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.caloriesAccent)
                .frame(width: 40, height: 4)
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.proteinAccent)
                .frame(width: 28, height: 4)
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.carbsAccent)
                .frame(width: 48, height: 4)
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.fatAccent)
                .frame(width: 20, height: 4)
        }
    }
}
