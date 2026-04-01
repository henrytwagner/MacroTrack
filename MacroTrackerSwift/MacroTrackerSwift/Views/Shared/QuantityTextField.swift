import SwiftUI

// MARK: - QuantityTextField

/// A standard `TextField` with `.decimalPad`. When the unit is fraction-friendly
/// (non-metric), a horizontal bar of fraction pills appears below the field.
/// Tapping a pill sets the quantity; the user can still type manually.
struct QuantityTextField: View {

    @Binding var text: String
    let unit: String
    var placeholder: String = "0"

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(.decimalPad)
    }
}

// MARK: - FractionBar

/// Horizontal scrollable bar of common fraction quick-select buttons.
/// Shown below quantity fields when the selected unit is fraction-friendly.
struct FractionBar: View {

    @Binding var text: String

    private static let options: [(label: String, value: Double)] = [
        ("⅛", 0.125),
        ("¼", 0.25),
        ("⅓", 1.0 / 3.0),
        ("½", 0.5),
        ("⅔", 2.0 / 3.0),
        ("¾", 0.75),
        ("1",  1.0),
        ("1½", 1.5),
        ("2",  2.0),
        ("3",  3.0),
    ]

    private var currentValue: Double? { Double(text) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                ForEach(Self.options, id: \.label) { option in
                    let selected = currentValue.map { abs($0 - option.value) < 0.001 } ?? false
                    Button {
                        text = fractionToDecimalString(
                            whole: Int(option.value),
                            fraction: closestFraction(to: option.value).fraction
                        )
                    } label: {
                        Text(option.label)
                            .font(.appCaption1)
                            .fontWeight(selected ? .semibold : .regular)
                            .foregroundStyle(selected ? Color.white : Color.appText)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xs)
                            .background(selected ? Color.appTint : Color.appSurfaceSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.sm))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
