import SwiftUI

/// Full-screen onboarding flow with gradient progress bar and horizontal slide transitions.
struct OnboardingContainerView: View {
    @State private var vm = OnboardingViewModel()

    var body: some View {
        VStack(spacing: 0) {
            // Gradient progress bar (brand signature)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.appSurfaceSecondary)
                    // Multi-color gradient bar matching website brand
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.caloriesAccent, .proteinAccent, .carbsAccent, .fatAccent],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * vm.progress)
                        .animation(.easeInOut(duration: 0.3), value: vm.progress)
                }
            }
            .frame(height: 3)

            // Page content
            ZStack {
                pageContent
                    .id(vm.currentPage)
                    .transition(.asymmetric(
                        insertion:  .move(edge: vm.direction == .forward ? .trailing : .leading),
                        removal:    .move(edge: vm.direction == .forward ? .leading : .trailing)
                    ))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()

            // Footer
            footer
        }
        .background(Color.appBackground)
        .preferredColorScheme(.dark)
        .onAppear {
            vm.inferUnits()
        }
    }

    // MARK: - Page Router

    @ViewBuilder
    private var pageContent: some View {
        switch vm.currentPage {
        case 0:  OnboardingWelcomePage(vm: vm)
        case 1:  OnboardingHeightPage(vm: vm)
        case 2:  OnboardingWeightPage(vm: vm)
        case 3:  OnboardingDOBPage(vm: vm)
        case 4:  OnboardingSexPage(vm: vm)
        case 5:  OnboardingActivityPage(vm: vm)
        case 6:  OnboardingGoalTypePage(vm: vm)
        case 7:  OnboardingAggressivenessPage(vm: vm)
        case 8:  OnboardingMacroReviewPage(vm: vm)
        case 9:  OnboardingFeatureTipPage(
                    icon: "waveform.circle.fill",
                    iconColor: .appTint,
                    glowColor: .proteinAccent,
                    title: "Kitchen Mode",
                    headline: "Hands-free while you cook",
                    detail: "Just say what you're making — MacroTrack listens, parses, and logs your ingredients in real time. Draft cards appear as you speak so you can review before saving."
                 )
        case 10: OnboardingFeatureTipPage(
                    icon: "scalemass.fill",
                    iconColor: .fatAccent,
                    glowColor: .fatAccent,
                    title: "Smart Scale",
                    headline: "Precision from your countertop",
                    detail: "Connect a Bluetooth kitchen scale for exact weights. Place an ingredient, and MacroTrack reads the measurement automatically — no typing required."
                 )
        default: EmptyView()
        }
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(spacing: Spacing.md) {
            if vm.saveError != nil {
                Text(vm.saveError!)
                    .font(.appFootnote)
                    .foregroundStyle(Color.appDestructive)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: Spacing.md) {
                // Back button
                if vm.showBackButton {
                    Button {
                        vm.goBack()
                    } label: {
                        Text("Back")
                            .font(.appSubhead)
                            .fontWeight(.medium)
                            .foregroundStyle(Color.appTextSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.lg)
                    }
                    .buttonStyle(.plain)
                }

                // Next / Get Started / Finish — warm gradient CTA
                Button {
                    if vm.isLastPage {
                        Task { await vm.saveAll() }
                    } else {
                        vm.advance()
                    }
                } label: {
                    Group {
                        if vm.isSaving {
                            ProgressView().tint(.white)
                        } else {
                            Text(vm.nextButtonTitle)
                                .font(.appSubhead)
                                .fontWeight(.semibold)
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.lg)
                    .background(
                        Group {
                            if vm.canAdvance {
                                LinearGradient(
                                    colors: [.caloriesAccent, Color(red: 1.0, green: 0.42, blue: 0.21), .carbsAccent],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            } else {
                                Color.appTextTertiary
                            }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                    .shadow(
                        color: vm.canAdvance ? Color.caloriesAccent.opacity(0.25) : .clear,
                        radius: 12, y: 4
                    )
                }
                .buttonStyle(.plain)
                .disabled(!vm.canAdvance || vm.isSaving)
            }
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.top, Spacing.md)
        .padding(.bottom, Spacing.lg)
        .background(Color.appBackground)
    }
}
