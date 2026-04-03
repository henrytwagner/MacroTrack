import SwiftUI

struct TopFoodsCard: View {
    @Environment(StatsStore.self) private var statsStore

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Most Logged Foods")
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            if statsStore.topFoods.isEmpty {
                Text("No data for this period")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextTertiary)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(statsStore.topFoods.prefix(5).enumerated()), id: \.element.id) { i, food in
                        if i > 0 { Divider().padding(.leading, Spacing.lg) }

                        HStack {
                            Text("\(i + 1).")
                                .font(.appBody)
                                .foregroundStyle(Color.appTextTertiary)
                                .frame(width: 24, alignment: .leading)

                            Text(food.name)
                                .font(.appBody)
                                .foregroundStyle(Color.appText)
                                .lineLimit(1)

                            Spacer()

                            Text("\(food.totalLogCount)x")
                                .font(.appSubhead)
                                .foregroundStyle(Color.appTextSecondary)
                                .monospacedDigit()

                            Text("\(Int(food.avgCalories)) cal")
                                .font(.appSubhead)
                                .foregroundStyle(Color.appTextTertiary)
                                .monospacedDigit()
                                .frame(width: 60, alignment: .trailing)
                        }
                        .padding(.vertical, Spacing.md)
                        .padding(.horizontal, Spacing.lg)
                    }
                }
            }
        }
        .padding(Spacing.xl)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
    }
}
