import SwiftUI
import Charts

struct WeightTrackingView: View {
    @Environment(WeightStore.self) private var weightStore
    @Environment(ProfileStore.self) private var profileStore

    @State private var showLogSheet = false

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                // Chart
                if !weightStore.entries.isEmpty {
                    WeightChartView(entries: weightStore.entries,
                                    movingAverage: weightStore.movingAverage)
                        .frame(height: 220)
                        .padding(Spacing.lg)
                        .background(Color.appSurface)
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                }

                // Current weight card
                currentWeightCard

                // Recent entries
                recentEntriesSection
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.sm)
            .padding(.bottom, 100)
        }
        .background(Color.appBackground)
        .navigationTitle("Weight")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showLogSheet = true } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showLogSheet) {
            LogWeightSheet()
                .environment(weightStore)
                .environment(profileStore)
        }
        .task {
            let to = todayString()
            let from = dateString(daysAgo: 90)
            await weightStore.fetch(from: from, to: to)
        }
    }

    private var currentWeightCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text("Current")
                    .font(.appCaption1)
                    .foregroundStyle(Color.appTextTertiary)

                if let weight = weightStore.latestWeight {
                    let isMetric = profileStore.profile?.preferredUnits != .imperial
                    let displayWeight = isMetric ? weight : weight * 2.20462
                    let unitLabel = isMetric ? "kg" : "lbs"

                    Text("\(displayWeight, specifier: "%.1f") \(unitLabel)")
                        .font(.appTitle2)
                        .foregroundStyle(Color.appText)
                        .monospacedDigit()
                } else {
                    Text("No data")
                        .font(.appTitle2)
                        .foregroundStyle(Color.appTextTertiary)
                }
            }

            Spacer()

            if let rate = weightStore.weeklyRateKg {
                let isMetric = profileStore.profile?.preferredUnits != .imperial
                let displayRate = isMetric ? rate : rate * 2.20462
                let unitLabel = isMetric ? "kg" : "lbs"

                VStack(alignment: .trailing, spacing: Spacing.xs) {
                    Text("Weekly")
                        .font(.appCaption1)
                        .foregroundStyle(Color.appTextTertiary)

                    HStack(spacing: 4) {
                        Image(systemName: rate > 0 ? "arrow.up.right" : rate < 0 ? "arrow.down.right" : "arrow.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(rate > 0 ? Color.appWarning : rate < 0 ? Color.appSuccess : Color.appTextSecondary)

                        Text("\(abs(displayRate), specifier: "%.1f") \(unitLabel)/wk")
                            .font(.appSubhead)
                            .foregroundStyle(Color.appText)
                            .monospacedDigit()
                    }
                }
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }

    private var recentEntriesSection: some View {
        VStack(spacing: Spacing.md) {
            Text("History")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Spacing.xs)

            if weightStore.entries.isEmpty {
                Text("No weight entries yet.")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(Spacing.xl)
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            } else {
                VStack(spacing: 0) {
                    let recent = weightStore.entries.suffix(10).reversed()
                    ForEach(Array(recent.enumerated()), id: \.element.id) { i, entry in
                        if i > 0 { Divider().padding(.leading, Spacing.lg) }
                        weightEntryRow(entry)
                    }
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
            }
        }
    }

    private func weightEntryRow(_ entry: WeightEntry) -> some View {
        let isMetric = profileStore.profile?.preferredUnits != .imperial
        let displayWeight = isMetric ? entry.weightKg : entry.weightKg * 2.20462
        let unitLabel = isMetric ? "kg" : "lbs"

        return HStack {
            Text(formattedDate(entry.date))
                .font(.appBody)
                .foregroundStyle(Color.appText)

            Spacer()

            Text("\(displayWeight, specifier: "%.1f") \(unitLabel)")
                .font(.appBody)
                .foregroundStyle(Color.appText)
                .monospacedDigit()
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
    }

    // MARK: - Helpers

    private func formattedDate(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let date = f.date(from: dateStr) else { return dateStr }
        let out = DateFormatter()
        out.dateFormat = "MMM d"
        return out.string(from: date)
    }

    private func dateString(daysAgo: Int) -> String {
        let cal = Calendar.current
        let date = cal.date(byAdding: .day, value: -daysAgo, to: Date())!
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }
}
