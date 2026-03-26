import SwiftUI

struct RootTabView: View {
    @Environment(TabRouter.self) private var tabRouter

    var body: some View {
        @Bindable var router = tabRouter
        TabView(selection: $router.selectedTab) {
            DashboardView()
                .tabItem {
                    Label("Dashboard", systemImage: "house.fill")
                }
                .tag(0)

            LogView()
                .tabItem {
                    Label("Log", systemImage: "book.fill")
                }
                .tag(1)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle.fill")
                }
                .tag(2)

            #if DEBUG
            KitchenModeDebugView()
                .tabItem {
                    Label("Debug", systemImage: "waveform.badge.mic")
                }
                .tag(99)
            #endif
        }
        .tint(Color.appTint)
    }
}

#Preview {
    RootTabView()
        .environment(TabRouter.shared)
        .environment(DateStore.shared)
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DashboardLayoutStore.shared)
        .environment(ProfileStore.shared)
}
