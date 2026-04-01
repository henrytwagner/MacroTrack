import SwiftUI

/// Page 2: Weight input with branded picker.
struct OnboardingWeightPage: View {
    @Bindable var vm: OnboardingViewModel

    var body: some View {
        VStack(spacing: Spacing.xl) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(Color.proteinAccent.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)
                Image(systemName: "scalemass.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(Color.proteinAccent)
            }

            Text("How much do you weigh?")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(Color.appText)

            Text("Helps calculate your daily targets.")
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
        Picker("Weight", selection: Binding(
            get: { Int(vm.displayWeight.rounded()) },
            set: { vm.displayWeight = Double($0) }
        )) {
            ForEach(70...400, id: \.self) { lb in
                Text("\(lb) lb").tag(lb)
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

    private var metricPicker: some View {
        Picker("Weight", selection: Binding(
            get: { Int(vm.weightValue.rounded()) },
            set: { vm.weightValue = Double($0) }
        )) {
            ForEach(30...180, id: \.self) { kg in
                Text("\(kg) kg").tag(kg)
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
