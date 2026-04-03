import SwiftUI

/// Page 3: Date of birth selection with branded styling.
struct OnboardingDOBPage: View {
    @Bindable var vm: OnboardingViewModel

    private let minDate = Calendar.current.date(byAdding: .year, value: -100, to: Date()) ?? Date()
    private let maxDate = Calendar.current.date(byAdding: .year, value: -13, to: Date()) ?? Date()

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(Color.fatAccent.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)
                Image(systemName: "calendar")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.fatAccent)
            }

            Text("When were you born?")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Color.appText)

            Text("Your age helps fine-tune calorie estimates.")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)

            DatePicker(
                "Date of birth",
                selection: $vm.dateOfBirth,
                in: minDate...maxDate,
                displayedComponents: .date
            )
            .datePickerStyle(.wheel)
            .labelsHidden()
            .padding(Spacing.lg)
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: BorderRadius.xl)
                    .stroke(Color.appBorderLight, lineWidth: 1)
            )

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.xl)
    }
}
