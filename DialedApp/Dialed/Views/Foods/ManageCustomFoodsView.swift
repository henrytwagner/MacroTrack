import SwiftUI
import UIKit

// MARK: - ManageCustomFoodsView

@MainActor
struct ManageCustomFoodsView: View {

    @State private var vm:       ManageCustomFoodsViewModel = ManageCustomFoodsViewModel()
    @State private var editMode: CreateFoodMode?
    @State private var infoFood: IdentifiedFood?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar
                    searchBar
                        .padding(.horizontal, Spacing.lg)
                        .padding(.top, Spacing.sm)
                        .padding(.bottom, Spacing.md)

                    // Content
                    contentArea
                }

                // Undo snackbar overlay
                if let food = vm.deletedFood {
                    UndoSnackbar(
                        message:   "\(food.name) deleted.",
                        visible:    true,
                        onUndo:    { vm.undoDelete() },
                        onDismiss: {
                            let snapshot = food
                            Task { await vm.commitDelete(snapshot) }
                        }
                    )
                    .ignoresSafeArea(edges: .bottom)
                }
            }
            .navigationTitle("My Foods")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        editMode = .new(prefillName: nil, prefillBarcode: nil)
                    } label: {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                    }
                }
            }
            .task { await vm.load() }
            .sheet(item: $infoFood) { identified in
                FoodInfoPage(
                    food: identified.food,
                    onDismiss: {
                        infoFood = nil
                        Task { await vm.load() }
                    },
                    onEditCustom: { food in
                        infoFood = nil
                        editMode = .editCustom(food)
                    },
                    onPublishCustom: { food in
                        infoFood = nil
                        editMode = .publishFromCustom(food)
                    },
                    onFoodDeleted: {
                        infoFood = nil
                        Task { await vm.load() }
                    })
            }
            .sheet(item: $editMode) { mode in
                CreateFoodSheet(
                    mode:      mode,
                    onSaved:   { _ in Task { await vm.load() } },
                    onPublish: { food in
                        editMode = .publishFromCustom(food)
                    },
                    onDelete:  { food in
                        editMode = nil
                        vm.delete(food)
                    },
                    onDismiss: { editMode = nil }
                )
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.appTextTertiary)
            TextField("Search my foods…", text: $vm.query)
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
            ProgressView()
                .tint(Color.appTint)
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
                Image(systemName: "fork.knife")
                    .font(.system(size: 40))
                    .foregroundStyle(Color.appTextTertiary)
                Text(vm.query.isEmpty
                     ? "No custom foods yet.\nTap + to create one."
                     : "No foods matching \"\(vm.query)\".")
                    .font(.appSubhead)
                    .foregroundStyle(Color.appTextSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, Spacing.xl)
            }
            Spacer()
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(vm.filteredFoods.enumerated()), id: \.element.id) { index, food in
                            if index > 0 {
                                Divider().padding(.leading, Spacing.lg)
                            }
                            FoodSearchResultRow(
                                food:        .custom(food),
                                showQuickAdd: false,
                                onTap:       {
                                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    infoFood = IdentifiedFood(food: .custom(food))
                                },
                                onQuickAdd:  nil
                            )
                        }
                    }
                    .background(Color.appSurface)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.lg)
                }
            }
        }
    }
}
