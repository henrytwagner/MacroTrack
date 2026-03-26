import SwiftUI

// MARK: - KitchenModeView

/// Full-screen Kitchen Mode session.
/// Port of mobile/app/kitchen-mode.tsx.
/// Camera section is stubbed (Session E4).
struct KitchenModeView: View {
    @Environment(DailyLogStore.self) private var dailyLog
    @Environment(GoalStore.self) private var goalStore
    @Environment(DateStore.self) private var dateStore
    @Environment(DraftStore.self) private var draftStore

    @State private var vm = KitchenModeViewModel()
    @State private var showCancelAlert = false

    @AppStorage("kitchenMacroPillStyleIndex") private var macroStyleIndex: Int = 0
    @State private var kitchenPillExpanded: Bool = false
    @State private var pillPressing: Bool = false

    let onDismiss: () -> Void

    // MARK: - Body

    var body: some View {
        Group {
            switch vm.sessionState {
            case .error(let message):
                errorScreen(message: message)
            case .cancelled:
                // Dismiss handled by onChange below
                Color.clear
            default:
                mainContent
            }
        }
        .background(Color.appBackground)
        .task {
            await vm.startSession()
        }
        .onDisappear {
            vm.cleanupOnDisappear()
        }
        .onChange(of: vm.sessionState) { _, newState in
            switch newState {
            case .saving, .cancelled:
                onDismiss()
            default:
                break
            }
        }
        .alert("Cancel Session", isPresented: $showCancelAlert) {
            Button("Keep Going", role: .cancel) {}
            Button("Discard", role: .destructive) {
                vm.performCancel()
            }
        } message: {
            let count = vm.items.filter { $0.state == .normal }.count
            if count > 0 {
                Text("Discard \(count) item\(count != 1 ? "s" : "")?")
            } else {
                Text("End this session without saving?")
            }
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        VStack(spacing: 0) {
            // Top navigation bar
            topBar

            // Content area: cards + overlays
            ZStack(alignment: .top) {
                // Scrollable card list
                ScrollViewReader { proxy in
                    List {
                        if vm.items.isEmpty {
                            emptyState
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(
                                    top: Spacing.xxxl, leading: Spacing.xl,
                                    bottom: Spacing.xxxl, trailing: Spacing.xl))
                        } else {
                            ForEach(vm.reversedItems, id: \.id) { item in
                                DraftMealCard(
                                    item: item,
                                    isActive: item.id == vm.activeId,
                                    isEditing: item.id == vm.editingItemId,
                                    onSendTranscript: { text in
                                        vm.sendTranscript(text)
                                    },
                                    onRemove: {
                                        vm.touchRemoveItem(itemId: item.id)
                                    },
                                    onEditQuantity: { qty, unit in
                                        vm.touchEditItem(itemId: item.id, quantity: qty, unit: unit)
                                    },
                                    onFillManually: { name, cal, p, c, f, ss, su in
                                        vm.touchCompleteCreation(
                                            itemId: item.id, name: name,
                                            calories: cal, proteinG: p,
                                            carbsG: c, fatG: f,
                                            servingSize: ss, servingUnit: su)
                                    },
                                    onStartEdit: {
                                        vm.openInlineEdit(itemId: item.id)
                                    },
                                    onEndEdit: {
                                        vm.closeInlineEdit()
                                    },
                                    onEditPreview: { qty in
                                        vm.editingQuantity = qty
                                    }
                                )
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(
                                    top: Spacing.xs, leading: Spacing.lg,
                                    bottom: Spacing.xs, trailing: Spacing.lg))
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    if item.state == .normal && item.id != vm.editingItemId {
                                        Button(role: .destructive) {
                                            vm.touchRemoveItem(itemId: item.id)
                                        } label: {
                                            Label("Remove", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .contentMargins(.top, 64, for: .scrollContent)
                    .contentMargins(.bottom, Spacing.lg, for: .scrollContent)
                    .onChange(of: vm.items.count) { _, _ in
                        // Auto-scroll to top on new card
                        if let firstId = vm.reversedItems.first?.id {
                            withAnimation {
                                proxy.scrollTo(firstId, anchor: .top)
                            }
                        }
                    }
                }

                // Floating macro pill overlay
                macroPillOverlay
                    .padding(.horizontal, Spacing.md)
                    .padding(.top, Spacing.sm)

                // Floating caption / edit row
                if vm.textDisplayMode != .off {
                    VStack {
                        Spacer()
                        captionOrEditRow
                            .padding(.horizontal, Spacing.lg)
                            .padding(.bottom, Spacing.sm)
                    }
                }
            }

            // Bottom bar
            bottomBar
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            // Back / Cancel
            Button {
                handleCancel()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            Spacer()

            // Title
            VStack(spacing: 2) {
                Text("Kitchen Mode")
                    .font(.appTitle3)
                    .tracking(Typography.Tracking.title3)
                    .foregroundStyle(Color.appText)

                if let dateLabel = vm.dateLabel {
                    Text(dateLabel)
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .foregroundStyle(Color.appWarning)
                }
            }

            Spacer()

            // Save
            Button {
                vm.save()
            } label: {
                Image(systemName: "checkmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Color.appTint)
                    .clipShape(Capsule())
            }
            .frame(width: 44, height: 44)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.appBorder)
                .frame(height: 0.5)
        }
    }

    // MARK: - Macro Pill Overlay

    private var macroPillOverlay: some View {
        let goals: DailyGoal? = goalStore.goalsByDate[dateStore.selectedDate] ?? nil
        let totals = vm.liveProjectedTotals
        let radius: CGFloat = kitchenPillExpanded ? BorderRadius.full : 24

        return ZStack {
            if kitchenPillExpanded {
                if let g = goals {
                    MacroPillContent(totals: totals, goals: g, styleIndex: macroStyleIndex, isIcon: true)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.88)),
                            removal:   .opacity.combined(with: .scale(scale: 0.88))
                        ))
                }
            } else {
                if let g = goals {
                    MacroPillContent(totals: totals, goals: g, styleIndex: macroStyleIndex, isIcon: false)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.88)),
                            removal:   .opacity.combined(with: .scale(scale: 0.88))
                        ))
                } else {
                    MacroRingProgress(totals: totals, goals: nil, variant: .compact)
                        .transition(.opacity)
                }
            }
        }
        .padding(.horizontal, kitchenPillExpanded ? Spacing.lg : Spacing.md)
        .padding(.vertical, kitchenPillExpanded ? Spacing.md : Spacing.sm)
        .background(Color.appSurface)
        .clipShape(RoundedRectangle(cornerRadius: radius))
        .overlay(RoundedRectangle(cornerRadius: radius).stroke(Color.appBorder, lineWidth: 0.5))
        .shadow(color: .black.opacity(0.08), radius: 4, x: 0, y: 1)
        .scaleEffect(pillPressing ? 0.97 : 1.0, anchor: .center)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: pillPressing)
        .contentShape(RoundedRectangle(cornerRadius: radius))
        .onTapGesture {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                kitchenPillExpanded.toggle()
            }
        }
        .onLongPressGesture(minimumDuration: 0.45, pressing: { isPressing in
            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) { pillPressing = isPressing }
        }) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                pillPressing    = false
                macroStyleIndex = (macroStyleIndex + 1) % 3
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "mic")
                .font(.system(size: 48))
                .foregroundStyle(Color.appTextTertiary)

            Text("Start speaking to log food.\nTry: \"200 grams of chicken breast\"")
                .font(.appBody)
                .tracking(Typography.Tracking.body)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.vertical, Spacing.xxxl)
    }

    // MARK: - Caption / Edit Row

    @ViewBuilder
    private var captionOrEditRow: some View {
        if vm.textDisplayMode == .editing {
            HStack(spacing: Spacing.sm) {
                TextField("Type to send\u{2026}", text: $vm.editText)
                    .font(.appFootnote)
                    .tracking(Typography.Tracking.footnote)
                    .onSubmit {
                        vm.submitEdit()
                    }
                    .textFieldStyle(.plain)

                Button {
                    vm.submitEdit()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Color.appTint)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(Color.appSurfaceSecondary)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            .overlay(
                RoundedRectangle(cornerRadius: BorderRadius.md)
                    .stroke(Color.appBorder, lineWidth: 0.5)
            )
        } else if vm.textDisplayMode == .captions {
            HStack {
                if !vm.captionText.isEmpty {
                    Text(vm.captionText)
                        .font(.appFootnote)
                        .tracking(Typography.Tracking.footnote)
                        .foregroundStyle(Color.appText)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    vm.enterEditMode()
                } label: {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 20))
                        .foregroundStyle(Color.appTextSecondary)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(Color.appSurfaceSecondary)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack {
            // Text toggle
            Button {
                vm.toggleCaptions()
            } label: {
                Image(systemName: "text.alignleft")
                    .font(.system(size: 22))
                    .foregroundStyle(vm.textDisplayMode != .off ? Color.appTint : Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            // Camera toggle (stubbed for E4)
            Button {
                // Camera integration in Session E4
            } label: {
                Image(systemName: "camera")
                    .font(.system(size: 22))
                    .foregroundStyle(vm.barcodeModeActive ? Color.appTint : Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            Spacer()

            // Listening indicator — center
            ListeningIndicator(
                state: vm.listeningState,
                onPress: { vm.togglePause() }
            )

            Spacer()

            // Scale toggle (stub — wired in Phase F)
            Button {
                // BLE scale in Phase F
            } label: {
                Image(systemName: "scalemass")
                    .font(.system(size: 22))
                    .foregroundStyle(Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            // Add food (manual)
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                // Could present FoodSearchView, but for now just a stub
            } label: {
                Image(systemName: "plus.circle")
                    .font(.system(size: 22))
                    .foregroundStyle(Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.vertical, Spacing.lg)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.appBorder)
                .frame(height: 0.5)
        }
    }

    // MARK: - Error Screen

    private func errorScreen(message: String) -> some View {
        VStack(spacing: Spacing.lg) {
            Spacer()

            Image(systemName: "cloud.bolt")
                .font(.system(size: 56))
                .foregroundStyle(Color.appTextTertiary)

            Text("Connection Error")
                .font(.appHeadline)
                .tracking(Typography.Tracking.headline)
                .foregroundStyle(Color.appText)

            Text(message)
                .font(.appBody)
                .tracking(Typography.Tracking.body)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.xl)

            Button {
                onDismiss()
            } label: {
                Text("Go Back")
                    .font(.appHeadline)
                    .tracking(Typography.Tracking.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.xxl)
                    .padding(.vertical, Spacing.md)
                    .background(Color.appTint)
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            }

            Spacer()
        }
    }

    // MARK: - Actions

    private func handleCancel() {
        guard case .active = vm.sessionState else {
            onDismiss()
            return
        }
        if vm.items.isEmpty {
            vm.performCancel()
        } else {
            showCancelAlert = true
        }
    }
}

// MARK: - Preview

#Preview {
    KitchenModeView(onDismiss: {})
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DateStore.shared)
        .environment(DraftStore.shared)
}
