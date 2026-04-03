import SwiftUI

/// Page 1: Height input with branded picker and atmospheric design.
struct OnboardingHeightPage: View {
    @Bindable var vm: OnboardingViewModel

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(Color.carbsAccent.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)
                Image(systemName: "ruler.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.carbsAccent)
            }

            Text("How tall are you?")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Color.appText)

            Text("Used to estimate your calorie needs.")
                .font(.appBody)
                .foregroundStyle(Color.appTextSecondary)

            if vm.unitSystem == .imperial {
                imperialPicker
            } else {
                metricPicker
            }

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.xl)
    }

    private var imperialPicker: some View {
        HStack(spacing: Spacing.md) {
            Picker("Feet", selection: $vm.heightFeet) {
                ForEach(3...7, id: \.self) { ft in
                    Text("\(ft) ft").tag(ft)
                }
            }
            .pickerStyle(.wheel)
            .frame(maxWidth: 120)

            Picker("Inches", selection: $vm.heightInches) {
                ForEach(0...11, id: \.self) { inch in
                    Text("\(inch) in").tag(inch)
                }
            }
            .pickerStyle(.wheel)
            .frame(maxWidth: 120)
        }
        .frame(height: 160)
        .padding(Spacing.lg)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: BorderRadius.xl)
                .stroke(Color.appBorderLight, lineWidth: 1)
        )
    }

    private var metricPicker: some View {
        Picker("Height", selection: Binding(
            get: { Int(vm.heightValue.rounded()) },
            set: { vm.heightValue = Double($0) }
        )) {
            ForEach(100...230, id: \.self) { cm in
                Text("\(cm) cm").tag(cm)
            }
        }
        .pickerStyle(.wheel)
        .frame(height: 160)
        .padding(Spacing.lg)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: BorderRadius.xl)
                .stroke(Color.appBorderLight, lineWidth: 1)
        )
    }
}
