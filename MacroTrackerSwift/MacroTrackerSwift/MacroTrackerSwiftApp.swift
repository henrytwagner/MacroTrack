//
//  MacroTrackerSwiftApp.swift
//  MacroTrackerSwift
//
//  Created by Henry Wagner on 3/19/26.
//

import SwiftUI

@main
struct MacroTrackerSwiftApp: App {
    private let authStore        = AuthStore.shared
    private let appearanceStore  = AppearanceStore.shared
    private let dateStore        = DateStore.shared
    private let dailyLogStore    = DailyLogStore.shared
    private let goalStore        = GoalStore.shared
    private let draftStore       = DraftStore.shared
    private let layoutStore      = DashboardLayoutStore.shared
    private let profileStore     = ProfileStore.shared
    private let tabRouter        = TabRouter.shared
    private let mealsStore       = MealsStore.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authStore)
                .environment(appearanceStore)
                .environment(dateStore)
                .environment(dailyLogStore)
                .environment(goalStore)
                .environment(draftStore)
                .environment(layoutStore)
                .environment(profileStore)
                .environment(tabRouter)
                .environment(mealsStore)
                .preferredColorScheme(appearanceStore.colorScheme)
        }
    }
}
