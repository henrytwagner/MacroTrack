//
//  ContentView.swift
//  MacroTrackerSwift
//
//  Created by Henry Wagner on 3/19/26.
//

import SwiftUI

/// Thin root wrapper — renders the tab shell. All real UI lives in RootTabView.
struct ContentView: View {
    var body: some View {
        RootTabView()
    }
}

#Preview {
    ContentView()
        .environment(AppearanceStore.shared)
        .environment(DateStore.shared)
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DraftStore.shared)
        .environment(DashboardLayoutStore.shared)
        .environment(ProfileStore.shared)
        .environment(TabRouter.shared)
}
