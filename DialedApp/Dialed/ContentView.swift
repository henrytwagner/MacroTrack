//
//  ContentView.swift
//  Dialed
//
//  Created by Henry Wagner on 3/19/26.
//

import SwiftUI

/// Root wrapper — gates on auth state, then onboarding completeness.
struct ContentView: View {
    @Environment(AuthStore.self)    private var authStore
    @Environment(ProfileStore.self) private var profileStore
    @Environment(GoalStore.self)    private var goalStore

    var body: some View {
        Group {
            if !authStore.isAuthenticated {
                SignInView()
            } else if !profileStore.hasLoadedOnce {
                // Still loading profile — show spinner
                ProgressView()
                    .tint(Color.appTint)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.appBackground)
            } else if !profileStore.onboardingComplete || !hasGoals {
                OnboardingContainerView()
            } else {
                RootTabView()
            }
        }
        .task {
            await authStore.bootstrap()
        }
        .task(id: authStore.isAuthenticated) {
            guard authStore.isAuthenticated else { return }
            async let profileFetch: () = profileStore.fetch()
            async let goalFetch: () = goalStore.fetch(date: todayString())
            _ = await (profileFetch, goalFetch)
        }
    }

    /// Whether the user has at least one goal entry for today.
    private var hasGoals: Bool {
        if let goal = goalStore.goalsByDate[todayString()] {
            return goal != nil
        }
        return false
    }
}

#Preview {
    ContentView()
        .environment(AuthStore.shared)
        .environment(AppearanceStore.shared)
        .environment(DateStore.shared)
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DraftStore.shared)
        .environment(DashboardLayoutStore.shared)
        .environment(ProfileStore.shared)
        .environment(TabRouter.shared)
}
