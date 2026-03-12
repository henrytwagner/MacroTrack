import SwiftUI
import WidgetKit

// MARK: - Shared data (matches app payload)
struct Macros: Codable {
  let calories: Double
  let proteinG: Double
  let carbsG: Double
  let fatG: Double
}

struct WidgetData: Codable {
  let layoutId: String
  let totals: Macros
  let goals: Macros?
  let date: String
}

// MARK: - Timeline
struct MacroTrackEntry: TimelineEntry {
  let date: Date
  let data: WidgetData?
}

struct MacroTrackProvider: TimelineProvider {
  private let appGroupId = "group.com.henrywagner.macrotrack.widget"
  private let dataKey = "widgetData"

  func placeholder(in context: Context) -> MacroTrackEntry {
    MacroTrackEntry(date: Date(), data: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (MacroTrackEntry) -> Void) {
    let data = loadData()
    completion(MacroTrackEntry(date: Date(), data: data))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MacroTrackEntry>) -> Void) {
    let data = loadData()
    let entry = MacroTrackEntry(date: Date(), data: data)
    let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }

  private func loadData() -> WidgetData? {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: dataKey),
          let jsonData = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetData.self, from: jsonData)
  }
}

// MARK: - Colors (match app theme – explicit for readability on light widget background)
struct WidgetColors {
  static let text = Color(red: 0.11, green: 0.11, blue: 0.12)           // #1C1C1E
  static let textSecondary = Color(red: 0.56, green: 0.56, blue: 0.58)   // #8E8E93
  static let caloriesAccent = Color(red: 1, green: 0.18, blue: 0.33)     // #FF2D55
  static let proteinAccent = Color(red: 0.35, green: 0.34, blue: 0.84)  // #5856D6
  static let carbsAccent = Color(red: 1, green: 0.58, blue: 0)          // #FF9500
  static let fatAccent = Color(red: 0.19, green: 0.69, blue: 0.78)       // #30B0C7
  static let progressTrack = Color(red: 0.91, green: 0.91, blue: 0.93)  // #E8E8ED
  static let surface = Color.white
}

// MARK: - Compact layout for small widget (numbers get full row width so they don’t truncate)
struct CompactLayoutView: View {
  let totals: Macros
  let goals: Macros
  private let colors: [Color] = [WidgetColors.caloriesAccent, WidgetColors.proteinAccent, WidgetColors.carbsAccent, WidgetColors.fatAccent]
  private let labels = ["Cal", "P", "C", "F"]
  private func progress(_ i: Int) -> CGFloat {
    let (cur, goal): (Double, Double) = i == 0 ? (totals.calories, goals.calories) : i == 1 ? (totals.proteinG, goals.proteinG) : i == 2 ? (totals.carbsG, goals.carbsG) : (totals.fatG, goals.fatG)
    guard goal > 0 else { return 0 }
    return min(CGFloat(cur / goal), 1.2)
  }
  private func value(_ i: Int) -> String {
    let (cur, goal): (Double, Double) = i == 0 ? (totals.calories, goals.calories) : i == 1 ? (totals.proteinG, goals.proteinG) : i == 2 ? (totals.carbsG, goals.carbsG) : (totals.fatG, goals.fatG)
    if i == 0 { return "\(Int(cur))/\(Int(goal))" }
    return "\(Int(cur))/\(Int(goal))g"
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      ForEach(0..<4, id: \.self) { i in
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(labels[i])
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(WidgetColors.text)
              .frame(width: 22, alignment: .leading)
            Text(value(i))
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(WidgetColors.text)
              .lineLimit(1)
              .minimumScaleFactor(0.65)
              .frame(maxWidth: .infinity, alignment: .trailing)
          }
          GeometryReader { geo in
            ZStack(alignment: .leading) {
              RoundedRectangle(cornerRadius: 2).fill(WidgetColors.progressTrack).frame(height: 4)
              RoundedRectangle(cornerRadius: 2)
                .fill(colors[i])
                .frame(width: min(progress(i), 1) * geo.size.width, height: 4)
            }
          }
          .frame(height: 4)
        }
      }
    }
    .padding(10)
  }
}

// MARK: - Layout: Bars
struct BarsLayoutView: View {
  let totals: Macros
  let goals: Macros
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      MacroBarRow(label: "Cal", current: totals.calories, goal: goals.calories, color: WidgetColors.caloriesAccent, unit: "")
      MacroBarRow(label: "Protein", current: totals.proteinG, goal: goals.proteinG, color: WidgetColors.proteinAccent, unit: "g")
      MacroBarRow(label: "Carbs", current: totals.carbsG, goal: goals.carbsG, color: WidgetColors.carbsAccent, unit: "g")
      MacroBarRow(label: "Fat", current: totals.fatG, goal: goals.fatG, color: WidgetColors.fatAccent, unit: "g")
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
  }
}

struct MacroBarRow: View {
  let label: String
  let current: Double
  let goal: Double
  let color: Color
  let unit: String
  private var progress: CGFloat {
    guard goal > 0 else { return 0 }
    return min(CGFloat(current / goal), 1.2)
  }
  private var displayValue: String {
    if unit.isEmpty { return "\(Int(current))/\(Int(goal))" }
    return "\(Int(current))/\(Int(goal))\(unit)"
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack {
        Text(label)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(WidgetColors.text)
        Spacer()
        Text(displayValue)
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(WidgetColors.text)
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: 3)
            .fill(WidgetColors.progressTrack)
            .frame(height: 8)
          RoundedRectangle(cornerRadius: 3)
            .fill(color)
            .frame(width: min(progress, 1) * geo.size.width, height: 8)
        }
      }
      .frame(height: 8)
    }
  }
}

// MARK: - Layout: Nested rings (Overview)
struct NestedRingsLayoutView: View {
  let totals: Macros
  let goals: Macros
  var body: some View {
    HStack(spacing: 16) {
      VStack(spacing: 4) {
        RingView(progress: goals.calories > 0 ? min(totals.calories / goals.calories, 1.2) : 0, color: WidgetColors.caloriesAccent, size: 56, strokeWidth: 6) {
          Text("\(Int(totals.calories))")
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(WidgetColors.text)
        }
        Text("Cal")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(WidgetColors.textSecondary)
      }
      VStack(alignment: .leading, spacing: 8) {
        SmallRingRow(label: "P", current: totals.proteinG, goal: goals.proteinG, color: WidgetColors.proteinAccent)
        SmallRingRow(label: "C", current: totals.carbsG, goal: goals.carbsG, color: WidgetColors.carbsAccent)
        SmallRingRow(label: "F", current: totals.fatG, goal: goals.fatG, color: WidgetColors.fatAccent)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
  }
}

struct SmallRingRow: View {
  let label: String
  let current: Double
  let goal: Double
  let color: Color
  private var progress: CGFloat {
    guard goal > 0 else { return 0 }
    return min(CGFloat(current / goal), 1.2)
  }
  var body: some View {
    HStack(spacing: 8) {
      RingView(progress: progress, color: color, size: 28, strokeWidth: 3) {
        Text(label)
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(WidgetColors.text)
      }
      Text("\(Int(current))/\(Int(goal))")
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(WidgetColors.text)
    }
  }
}

// MARK: - Layout: Activity rings (concentric)
struct ActivityRingsLayoutView: View {
  let totals: Macros
  let goals: Macros
  private let ringColors: [Color] = [WidgetColors.caloriesAccent, WidgetColors.proteinAccent, WidgetColors.carbsAccent, WidgetColors.fatAccent]
  private func progress(_ idx: Int) -> CGFloat {
    let (cur, goal): (Double, Double) = idx == 0 ? (totals.calories, goals.calories) : idx == 1 ? (totals.proteinG, goals.proteinG) : idx == 2 ? (totals.carbsG, goals.carbsG) : (totals.fatG, goals.fatG)
    guard goal > 0 else { return 0 }
    return min(CGFloat(cur / goal), 1.2)
  }
  var body: some View {
    HStack(spacing: 14) {
      ZStack {
        ForEach(0..<4, id: \.self) { i in
          ActivityRingView(progress: progress(i), color: ringColors[i], radius: 28 - CGFloat(i) * 5, strokeWidth: 5)
        }
      }
      .frame(width: 62, height: 62)
      VStack(alignment: .leading, spacing: 6) {
        StatRow(label: "Cal", value: Int(totals.calories), goal: Int(goals.calories), unit: "")
        StatRow(label: "P", value: Int(totals.proteinG), goal: Int(goals.proteinG), unit: "g")
        StatRow(label: "C", value: Int(totals.carbsG), goal: Int(goals.carbsG), unit: "g")
        StatRow(label: "F", value: Int(totals.fatG), goal: Int(goals.fatG), unit: "g")
      }
      Spacer(minLength: 0)
    }
    .padding(12)
  }
}

struct StatRow: View {
  let label: String
  let value: Int
  let goal: Int
  var unit: String = ""
  var body: some View {
    HStack(spacing: 6) {
      Text(label)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(WidgetColors.textSecondary)
        .frame(width: 22, alignment: .leading)
      Text("\(value)/\(goal)\(unit)")
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(WidgetColors.text)
    }
  }
}

// MARK: - Ring views
struct RingView<Content: View>: View {
  let progress: CGFloat
  let color: Color
  let size: CGFloat
  let strokeWidth: CGFloat
  @ViewBuilder let content: () -> Content
  var body: some View {
    ZStack {
      Circle().stroke(WidgetColors.progressTrack, lineWidth: strokeWidth)
      Circle()
        .trim(from: 0, to: min(progress, 1))
        .stroke(color, style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
      content()
    }
    .frame(width: size, height: size)
  }
}

struct ActivityRingView: View {
  let progress: CGFloat
  let color: Color
  let radius: CGFloat
  let strokeWidth: CGFloat
  var body: some View {
    ZStack {
      Circle().stroke(WidgetColors.progressTrack, lineWidth: strokeWidth)
      Circle()
        .trim(from: 0, to: min(progress, 1))
        .stroke(color, style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .frame(width: radius * 2 + strokeWidth, height: radius * 2 + strokeWidth)
  }
}

// MARK: - Main entry view
struct MacroTrackWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: MacroTrackEntry

  /// Opaque card-style background so widget never looks translucent
  private static let widgetBackground = WidgetColors.surface

  var body: some View {
    let content = Group {
      if let data = entry.data, let goals = data.goals {
        if family == .systemSmall {
          CompactLayoutView(totals: data.totals, goals: goals)
        } else {
          switch data.layoutId {
          case "bars":
            BarsLayoutView(totals: data.totals, goals: goals)
          case "nested-rings":
            NestedRingsLayoutView(totals: data.totals, goals: goals)
          case "activity-rings":
            ActivityRingsLayoutView(totals: data.totals, goals: goals)
          default:
            BarsLayoutView(totals: data.totals, goals: goals)
          }
        }
      } else {
        VStack(spacing: 4) {
          Text("Set goals to see progress")
            .font(.system(size: family == .systemSmall ? 12 : 14, weight: .semibold))
            .foregroundStyle(WidgetColors.text)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    if #available(iOSApplicationExtension 17.0, *) {
      content
        .containerBackground(for: .widget) { Self.widgetBackground }
        .widgetURL(URL(string: "macrotrack://"))
    } else {
      content
        .background(Self.widgetBackground)
        .widgetURL(URL(string: "macrotrack://"))
    }
  }
}

// MARK: - Widget definition
struct MacroTrackWidget: Widget {
  let kind: String = "MacroTrackWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MacroTrackProvider()) { entry in
      MacroTrackWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Today's Progress")
    .description("Your daily macro progress.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: - Bundle
@main
struct MacroTrackWidgetBundle: WidgetBundle {
  var body: some Widget {
    MacroTrackWidget()
  }
}
