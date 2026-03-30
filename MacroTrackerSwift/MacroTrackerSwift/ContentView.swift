//
//  ContentView.swift
//  MacroTrackerSwift
//
//  Created by Henry Wagner on 3/19/26.
//

import SwiftUI

/// Root wrapper — gates on auth state. Shows sign-in or main app.
struct ContentView: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        Group {
            if authStore.isAuthenticated {
                RootTabView()
            } else {
                SignInView()
            }
        }
        .task {
            await authStore.bootstrap()
        }
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
