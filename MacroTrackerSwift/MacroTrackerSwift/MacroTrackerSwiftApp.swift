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
    private let weightStore      = WeightStore.shared
    private let calendarStore    = CalendarStore.shared
    private let statsStore       = StatsStore.shared
    private let insightsStore    = InsightsStore.shared
    private let sessionStore     = SessionStore.shared
    private let progressPhotoStore = ProgressPhotoStore.shared

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
                .environment(weightStore)
                .environment(calendarStore)
                .environment(statsStore)
                .environment(insightsStore)
                .environment(sessionStore)
                .environment(progressPhotoStore)
                .preferredColorScheme(appearanceStore.colorScheme)
        }
    }
}
