import SwiftUI

struct StatsView: View {
    @Environment(StatsStore.self) private var statsStore

    var body: some View {
        @Bindable var store = statsStore

        ScrollView {
            VStack(spacing: Spacing.xl) {
                // Range picker
                Picker("Range", selection: $store.selectedRange) {
                    ForEach(StatsRange.allCases, id: \.self) { range in
                        Text(range.rawValue).tag(range)
                    }
                }
                .pickerStyle(.segmented)

                if statsStore.isLoading && statsStore.summaries.isEmpty {
                    ProgressView().tint(Color.appTint).padding(.top, Spacing.xxxl)
                } else {
                    CalorieTrendChart()
                    MacroTrendChart()
                    MacroAveragesCard()
                    ConsistencyCard()
                    MacroDistributionChart()
                    TopFoodsCard()
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.sm)
            .padding(.bottom, 40)
        }
        .background(Color.appBackground)
        .navigationTitle("Stats")
        .navigationBarTitleDisplayMode(.inline)
        .task { await statsStore.fetch(range: statsStore.selectedRange) }
        .onChange(of: statsStore.selectedRange) { _, newRange in
            Task { await statsStore.fetch(range: newRange) }
        }
    }
}
