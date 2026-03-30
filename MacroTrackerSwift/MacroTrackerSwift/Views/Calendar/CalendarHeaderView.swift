import SwiftUI

struct CalendarHeaderView: View {
    let month: Date
    let streak: Int
    let onPrevious: () -> Void
    let onNext: () -> Void

    var body: some View {
        HStack {
            Button(action: onPrevious) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appTextSecondary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)

            Spacer()

            Text(monthYearString)
                .font(.appHeadline)
                .foregroundStyle(Color.appText)

            if streak >= 3 {
                Text("\(streak)d")
                    .font(.appCaption1)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appWarning)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, 2)
                    .background(Color.appWarning.opacity(0.15))
                    .clipShape(Capsule())
            }

            Spacer()

            Button(action: onNext) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appTextSecondary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
    }

    private var monthYearString: String {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f.string(from: month)
    }
}
