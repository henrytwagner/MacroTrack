import SwiftUI
import UIKit

// MARK: - ManageCommunityFoodsView

@MainActor
struct ManageCommunityFoodsView: View {

    @State private var vm:           ManageCommunityFoodsViewModel = ManageCommunityFoodsViewModel()
    @State private var editMode:     CreateFoodMode?
    @State private var deleteTarget: CommunityFood?
    @State private var deleteError:  String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    searchBar
                        .padding(.horizontal, Spacing.lg)
                        .padding(.top, Spacing.sm)
                        .padding(.bottom, Spacing.md)

                    contentArea
                }
            }
            .navigationTitle("Community Foods")
            .navigationBarTitleDisplayMode(.large)
            .task { await vm.load() }
            .sheet(item: $editMode) { mode in
                CreateFoodSheet(
                    mode:      mode,
                    onSaved:   { _ in Task { await vm.load() } },
                    onDismiss: { editMode = nil }
                )
            }
            .alert("Delete community food?",
                   isPresented: Binding(
                       get:  { deleteTarget != nil },
                       set:  { if !$0 { deleteTarget = nil } }
                   )) {
                Button("Cancel", role: .cancel) { deleteTarget = nil }
                Button("Delete", role: .destructive) {
                    guard let food = deleteTarget else { return }
                    deleteTarget = nil
                    Task {
                        do {
                            try await vm.delete(food)
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                        } catch {
                            deleteError = error.localizedDescription
                        }
                    }
                }
            } message: {
                Text("This food will be permanently removed from the community library.")
            }
            .alert("Error", isPresented: Binding(
                get:  { deleteError != nil },
                set:  { if !$0 { deleteError = nil } }
            )) {
                Button("OK") { deleteError = nil }
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.appTextTertiary)
            TextField("Search community foods…", text: $vm.query)
                .font(.appBody)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
        .background(Color.appSurfaceSecondary)
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
    }

    // MARK: - Content

    @ViewBuilder
    private var contentArea: some View {
        if vm.isLoading {
            Spacer()
            ProgressView().tint(Color.appTint)
            Spacer()
        } else if let err = vm.error {
            Spacer()
            VStack(spacing: Spacing.md) {
                Image(systemName: "exclamationmark.circle")
                    .font(.system(size: 36))
                    .foregroundStyle(Color.appDestructive)
                Text(err)
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.xl)
            }
            Spacer()
        } else if vm.filteredFoods.isEmpty {
            Spacer()
            VStack(spacing: Spacing.md) {
                Image(systemName: "globe")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.appTextTertiary)
                Text(vm.query.isEmpty
                     ? "No community foods yet."
                     : "No foods matching \"\(vm.query)\".")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.xl)
            }
            Spacer()
        } else {
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(vm.filteredFoods.enumerated()), id: \.element.id) { index, food in
                        if index > 0 {
                            Divider().padding(.leading, Spacing.lg)
                        }
                        communityFoodRow(food)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    deleteTarget = food
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
                .background(Color.appSurface)
                .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                .padding(.horizontal, Spacing.lg)
                .padding(.bottom, Spacing.lg)
            }
        }
    }

    // MARK: - Community Food Row

    private func communityFoodRow(_ food: CommunityFood) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            editMode = .editCommunity(food)
        } label: {
            HStack(spacing: Spacing.md) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(food.name)
                        .font(.appSubhead)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.appText)
                        .lineLimit(1)

                    // Brand name (if available)
                    if let brand = food.brandName, !brand.isEmpty {
                        Text(brand)
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextSecondary)
                            .lineLimit(1)
                    }

                    // Macros + usage count
                    HStack(spacing: Spacing.xs) {
                        let srv = Self.fmt(food.defaultServingSize)
                        Text("\(srv) \(food.defaultServingUnit)  ·  \(Int(food.calories)) kcal  ·  \(Self.fmt(food.proteinG))g P  ·  \(Self.fmt(food.carbsG))g C  ·  \(Self.fmt(food.fatG))g F")
                            .font(.appCaption1)
                            .foregroundStyle(Color.appTextTertiary)
                            .lineLimit(1)
                    }

                    // Uses count
                    if food.usesCount > 0 {
                        Text("\(food.usesCount) use\(food.usesCount == 1 ? "" : "s")")
                            .font(.appCaption2)
                            .foregroundStyle(Color.appTextTertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: Spacing.sm) {
                    Image(systemName: CommunityFoodStatusIndicator.systemImage(for: food.status))
                        .font(.system(size: 16))
                        .foregroundStyle(CommunityFoodStatusIndicator.accentColor(for: food.status))
                        .accessibilityLabel(CommunityFoodStatusIndicator.accessibilityLabel(for: food.status))

                    Image(systemName: "chevron.forward")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.appTextTertiary)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.md)
            .background(Color.appSurface)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helper

    private static func fmt(_ v: Double) -> String {
        v.truncatingRemainder(dividingBy: 1) == 0
            ? String(Int(v))
            : String(format: "%.1f", v)
    }
}
