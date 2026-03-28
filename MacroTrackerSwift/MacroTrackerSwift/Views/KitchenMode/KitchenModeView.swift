import SwiftUI
@preconcurrency import AVFoundation

// MARK: - KitchenModeView

/// Full-screen Kitchen Mode session.
/// Port of mobile/app/kitchen-mode.tsx.
struct KitchenModeView: View {
    @Environment(DailyLogStore.self) private var dailyLog
    @Environment(GoalStore.self) private var goalStore
    @Environment(DateStore.self) private var dateStore
    @Environment(DraftStore.self) private var draftStore

    @State private var vm = KitchenModeViewModel()
    @State private var showCancelAlert = false
    @State private var showSaveAlert = false
    @State private var showUnconfirmedAlert = false

    @AppStorage("kitchenMacroPillStyleIndex") private var macroStyleIndex: Int = 0
    @State private var kitchenPillExpanded: Bool = false
    @State private var pillPressing: Bool = false
    @State private var showJumpToTop: Bool = false

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
        .background(Color.appBackground.ignoresSafeArea())
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
        .alert("Incomplete Items", isPresented: $showSaveAlert) {
            Button("Keep Editing", role: .cancel) {}
            Button("Save Anyway") {
                vm.save()
            }
        } message: {
            let incompleteCount = vm.items.filter { $0.state != .normal }.count
            let normalCount = vm.items.filter { $0.state == .normal }.count
            if normalCount > 0 {
                Text("\(incompleteCount) item\(incompleteCount != 1 ? "s are" : " is") still being set up and won't be saved. \(normalCount) completed item\(normalCount != 1 ? "s" : "") will be saved.")
            } else {
                Text("\(incompleteCount) item\(incompleteCount != 1 ? "s are" : " is") still being set up and won't be saved.")
            }
        }
        .alert("Unconfirmed Quantities", isPresented: $showUnconfirmedAlert) {
            Button("Go Back", role: .cancel) {}
            Button("Discard Unconfirmed", role: .destructive) {
                // Remove unconfirmed items and save
                DraftStore.shared.items.removeAll { $0.state == .normal && !$0.quantityConfirmed }
                if !vm.items.isEmpty {
                    vm.save()
                }
            }
        } message: {
            let count = vm.items.filter { $0.state == .normal && !$0.quantityConfirmed }.count
            Text("\(count) item\(count != 1 ? "s have" : " has") no confirmed quantity and won't be saved.")
        }
        .sheet(isPresented: $vm.showFoodSearch) {
            FoodSearchView(
                onDismiss: { vm.showFoodSearch = false },
                onAddIngredient: { ingredient in
                    vm.addLocalDraftItem(from: ingredient)
                    vm.showFoodSearch = false
                }
            )
            .environment(dailyLog)
            .environment(goalStore)
            .environment(dateStore)
            .environment(DraftStore.shared)
            .environment(MealsStore.shared)
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        GeometryReader { geo in
            let feedHeight = geo.size.width * 3 / 4

            VStack(spacing: 0) {
                // Top navigation bar — hidden in barcode mode (buttons move onto camera feed)
                if !vm.barcodeModeActive {
                    topBar
                }

                // Content area: cards + overlays
                ZStack(alignment: .top) {
                    if vm.barcodeModeActive {
                        barcodeModeContent(feedHeight: feedHeight, screenHeight: geo.size.height)
                    } else {
                        normalModeContent
                    }

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
    }

    // MARK: - Normal Mode Content (no camera)

    private var normalModeContent: some View {
        cardScrollView(emptyIcon: "mic",
                       emptyText: "Start speaking to log food.\nTry: \"200 grams of chicken breast\"")
    }

    // MARK: - Barcode Mode Content (camera + sheet)

    private func barcodeModeContent(feedHeight: CGFloat, screenHeight: CGFloat) -> some View {
        ZStack(alignment: .top) {
            // Camera feed — behind everything
            if vm.cameraPermissionGranted {
                KitchenCameraPreview(session: KitchenCameraSession.shared.captureSession)
                    .frame(height: feedHeight)
                    .clipped()
                    .onTapGesture(count: 2) {
                        vm.flipCamera()
                    }
            } else {
                Color.black
                    .frame(height: feedHeight)
            }

            // Cards scroll below the camera feed as a sheet
            ScrollView {
                VStack(spacing: 0) {
                    // Transparent spacer: pushes sheet below camera
                    Color.clear.frame(height: feedHeight)

                    // Sheet header — rounded top corners, clears floating macro pill
                    UnevenRoundedRectangle(topLeadingRadius: BorderRadius.xl,
                                           topTrailingRadius: BorderRadius.xl)
                        .fill(Color.appBackground)
                        .frame(height: 24 + Spacing.sm)

                    // Sheet body — cards
                    VStack(spacing: Spacing.md) {
                        // Scale card — same as normal mode
                        if vm.scaleState != .idle {
                            KitchenScaleCard(
                                connectionState: vm.scaleState,
                                reading: vm.scaleReading,
                                onConnect: { vm.connectScale() },
                                onDisconnect: { vm.disconnectScale() },
                                onCancelScan: { vm.cancelScaleScan() },
                                onSimulate: { vm.simulateScale() }
                            )
                        }

                        if vm.items.isEmpty {
                            barcodeModeEmptyState
                        } else {
                            ForEach(vm.reversedItems, id: \.id) { item in
                                draftCard(item: item)
                            }
                        }
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.bottom, Spacing.lg)
                    .frame(minHeight: screenHeight, alignment: .top)
                    .background(Color.appBackground)
                }
            }
            .scrollIndicators(.hidden)

            // Nav overlay — must be last in ZStack so it renders above the ScrollView
            cameraNavOverlay
                .padding(.horizontal, Spacing.lg)
                .padding(.vertical, Spacing.md)
                .frame(height: feedHeight)
                .contentShape(Rectangle())
                .onTapGesture(count: 2) {
                    vm.flipCamera()
                }
                .onTapGesture {
                    // Single-tap no-op — prevents double-tap from blocking button taps
                }

            // Debug barcode card — floats near bottom of camera feed
            if let gtin = vm.debugBarcode {
                debugBarcodeCard(gtin: gtin)
                    .padding(.horizontal, Spacing.lg)
                    .offset(y: feedHeight - 64)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    // MARK: - Camera Nav Overlay

    private var cameraNavOverlay: some View {
        VStack {
            // Top row: back / pill / save
            HStack(alignment: .top) {
                Button {
                    handleCancel()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(Color.black.opacity(0.55))
                        .clipShape(Circle())
                }

                Spacer()

                inlineMacroPill
                    .environment(\.colorScheme, .dark)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
                    .background(Color.black.opacity(0.55))
                    .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))

                Spacer()

                Button {
                    handleSave()
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(Color.appTint)
                        .clipShape(Capsule())
                }
            }

            Spacer()

            // Bottom right: flash + flip camera
            HStack {
                Spacer()

                VStack(spacing: Spacing.sm) {
                    if vm.cameraFacing == .back {
                        Button {
                            vm.toggleFlash()
                        } label: {
                            Image(systemName: vm.flashEnabled ? "bolt.fill" : "bolt.slash")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 36, height: 36)
                                .background(Color.black.opacity(0.55))
                                .clipShape(Circle())
                        }
                    }

                    Button {
                        vm.flipCamera()
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath.camera")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.black.opacity(0.55))
                            .clipShape(Circle())
                    }
                }
            }
        }
    }

    // MARK: - Shared Card Builder

    private func draftCard(item: DraftItem, heroMinHeight: CGFloat? = nil) -> some View {
        DraftMealCard(
            item: item,
            isHero: item.id == vm.heroId,
            isEditing: item.id == vm.editingItemId,
            heroMinHeight: heroMinHeight,
            scaleReading: vm.isScaleConnected ? vm.scaleReading : nil,
            scaleSkipped: vm.scaleSkippedIds.contains(item.id),
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
            },
            onScaleConfirm: { value, unit in
                vm.confirmScaleReading(for: item.id)
            },
            onScaleSkip: {
                vm.scaleSkippedIds.insert(item.id)
            },
            onTapToExpand: {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    vm.expandItem(item.id)
                }
            }
        )
    }

    // MARK: - Card Scroll View

    private func cardScrollView(emptyIcon: String, emptyText: String) -> some View {
        GeometryReader { geo in
            let heroHeight = geo.size.height * 0.4

            ZStack(alignment: .bottomTrailing) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: Spacing.md) {
                            // Scale card
                            if vm.scaleState != .idle {
                                KitchenScaleCard(
                                    connectionState: vm.scaleState,
                                    reading: vm.scaleReading,
                                    onConnect: { vm.connectScale() },
                                    onDisconnect: { vm.disconnectScale() },
                                    onCancelScan: { vm.cancelScaleScan() },
                                    onSimulate: { vm.simulateScale() }
                                )
                            }

                            if vm.items.isEmpty {
                                VStack(spacing: Spacing.md) {
                                    Image(systemName: emptyIcon)
                                        .font(.system(size: 48))
                                        .foregroundStyle(Color.appTextTertiary)

                                    Text(emptyText)
                                        .font(.system(size: 15))
                                        .foregroundStyle(Color.appTextSecondary)
                                        .multilineTextAlignment(.center)
                                }
                                .padding(.horizontal, Spacing.xl)
                                .padding(.vertical, Spacing.xxxl)
                            } else {
                                ForEach(vm.reversedItems, id: \.id) { item in
                                    draftCard(item: item, heroMinHeight: heroHeight)
                                        .id(item.id)
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.md)
                        .background(GeometryReader { inner in
                            Color.clear.preference(
                                key: ScrollOffsetKey.self,
                                value: inner.frame(in: .named("kitchenScroll")).minY
                            )
                        })
                    }
                    .coordinateSpace(name: "kitchenScroll")
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .onPreferenceChange(ScrollOffsetKey.self) { offset in
                        let shouldShow = offset < -100
                        if shouldShow != showJumpToTop {
                            withAnimation(.easeOut(duration: 0.2)) {
                                showJumpToTop = shouldShow
                            }
                        }
                    }
                    .onChange(of: vm.items.count) { _, _ in
                        if let firstId = vm.reversedItems.first?.id {
                            withAnimation {
                                proxy.scrollTo(firstId, anchor: .top)
                            }
                        }
                    }

                    // Jump-to-top button (needs proxy in scope)
                    if showJumpToTop {
                        VStack {
                            Spacer()
                            HStack {
                                Spacer()
                                Button {
                                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                        proxy.scrollTo(vm.reversedItems.first?.id, anchor: .top)
                                    }
                                } label: {
                                    Image(systemName: "arrow.up")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .frame(width: 40, height: 40)
                                        .background(.ultraThinMaterial)
                                        .clipShape(Circle())
                                        .overlay(Circle().stroke(KitchenTheme.cardBorder, lineWidth: 1))
                                }
                                .padding(Spacing.lg)
                            }
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
            }
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(alignment: .top) {
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

            // Inline macro preview (replaces title)
            VStack(spacing: 2) {
                inlineMacroPill
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
                handleSave()
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
        .padding(.vertical, Spacing.sm)
    }

    // MARK: - Inline Macro Pill

    private var inlineMacroPill: some View {
        let goals: DailyGoal? = goalStore.goalsByDate[dateStore.selectedDate] ?? nil
        let totals = vm.liveProjectedTotals

        return ZStack {
            if kitchenPillExpanded {
                if let g = goals {
                    MacroPillContent(totals: totals, goals: g, styleIndex: macroStyleIndex, isIcon: false)
                        .transition(.asymmetric(
                            insertion: .opacity.combined(with: .scale(scale: 0.88)),
                            removal:   .opacity.combined(with: .scale(scale: 0.88))
                        ))
                }
            } else {
                if let g = goals {
                    MacroPillContent(totals: totals, goals: g, styleIndex: macroStyleIndex, isIcon: true)
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
        .fixedSize()
        .animation(.spring(response: 0.4, dampingFraction: 0.82), value: kitchenPillExpanded)
        .scaleEffect(pillPressing ? 0.97 : 1.0, anchor: .center)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: pillPressing)
        .contentShape(Rectangle())
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

    // MARK: - Barcode Mode Empty State

    private var barcodeModeEmptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "barcode.viewfinder")
                .font(.system(size: 48))
                .foregroundStyle(Color.appTextTertiary)

            Text("Point the camera at a barcode to log food.\nYou can also speak or type.")
                .font(.appBody)
                .tracking(Typography.Tracking.body)
                .foregroundStyle(Color.appTextSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, Spacing.xl)
        .padding(.vertical, Spacing.xxxl)
    }

    // MARK: - Debug Barcode Card

    private func debugBarcodeCard(gtin: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "barcode")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))

            Text(gtin)
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
        .background(Color.black.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
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
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
            .overlay(
                RoundedRectangle(cornerRadius: BorderRadius.md)
                    .stroke(KitchenTheme.cardBorder, lineWidth: 0.5)
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
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: BorderRadius.md))
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack {
            // Voice toggle
            Button {
                vm.toggleVoice()
            } label: {
                Image(systemName: vm.audioActive ? "mic.fill" : "mic.slash")
                    .font(.system(size: 22))
                    .foregroundStyle(vm.audioActive ? Color.appTint : Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            // Camera toggle (barcode + future food recognition)
            Button {
                vm.toggleBarcodeMode()
            } label: {
                Image(systemName: "camera")
                    .font(.system(size: 22))
                    .foregroundStyle(vm.barcodeModeActive ? Color.appTint : Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            Spacer()

            // Listening indicator — center (only when voice is active)
            if vm.audioActive {
                ListeningIndicator(
                    state: vm.listeningState,
                    onPress: { vm.togglePause() }
                )
            }

            Spacer()

            // Scale toggle
            Button {
                switch vm.scaleState {
                case .idle, .error:
                    vm.connectScale()
                case .scanning, .connecting:
                    vm.cancelScaleScan()
                case .connected:
                    vm.disconnectScale()
                }
            } label: {
                Image(systemName: vm.isScaleConnected ? "scalemass.fill" : "scalemass")
                    .font(.system(size: 22))
                    .foregroundStyle(vm.scaleState.isActive ? Color.appTint : Color.appTextSecondary)
            }
            .frame(width: 44, height: 44)

            // Add food (manual search)
            Button {
                vm.showFoodSearch = true
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

    private func handleSave() {
        guard case .active = vm.sessionState else { return }
        let incompleteItems = vm.items.filter { $0.state != .normal }
        let unconfirmedItems = vm.items.filter { $0.state == .normal && !$0.quantityConfirmed }

        if !unconfirmedItems.isEmpty {
            showUnconfirmedAlert = true
        } else if !incompleteItems.isEmpty {
            showSaveAlert = true
        } else {
            vm.save()
        }
    }

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

// MARK: - ScrollOffsetKey

private struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
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
