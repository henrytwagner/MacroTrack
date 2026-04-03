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

    @Environment(\.scenePhase) private var scenePhase

    @State private var vm = KitchenModeViewModel()
    @State private var showCancelAlert = false
    @State private var showSaveAlert = false
    @State private var showUnconfirmedAlert = false

    @AppStorage("kitchenMacroPillStyleIndex") private var macroStyleIndex: Int = 0
    @State private var kitchenPillExpanded: Bool = false
    @State private var pillPressing: Bool = false
    @State private var showJumpToTop: Bool = false
    @State private var cameraControlsVisible: Bool = true
    @State private var cameraScrollOffset: CGFloat = 0
    @State private var showCameraProcessingDebug: Bool = false
    @State private var cameraProcessingStartTime: Date? = nil

    var resumeSessionId: String? = nil
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
            vm.resumeSessionId = resumeSessionId
            await vm.startSession()
        }
        .onDisappear {
            vm.cleanupOnDisappear()
        }
        .onChange(of: vm.sessionState) { _, newState in
            switch newState {
            case .saving, .cancelled, .paused:
                onDismiss()
            default:
                break
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            vm.handleScenePhaseChange(newPhase)
        }
        .onChange(of: vm.barcodeModeActive) { _, active in
            // Re-show the camera overlay whenever camera mode is turned on
            if active { cameraControlsVisible = true }
        }
        .onChange(of: vm.isScaleConnected) { wasConnected, isConnected in
            if wasConnected && !isConnected {
                vm.handleScaleStateChange(vm.scaleState)
            }
        }
        .onChange(of: vm.scaleReading?.display) { _, _ in
            vm.updateLastScaleReading()
            vm.updateAutoConfirmTimer()
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
                onDismiss: {
                    vm.pendingSearchName = nil
                    vm.showFoodSearch = false
                },
                onSelectFoodDirect: { food in
                    vm.addLocalDraftItemDirect(food: food)
                    vm.pendingSearchName = nil
                    vm.showFoodSearch = false
                },
                onCreateFoodDirect: { name in
                    vm.pendingSearchName = nil
                    vm.createLocalDraftItem(name: name)
                },
                initialQuery: vm.pendingSearchName
            )
            .environment(dailyLog)
            .environment(goalStore)
            .environment(dateStore)
            .environment(DraftStore.shared)
            .environment(MealsStore.shared)
        }
        .sheet(isPresented: $vm.showScaleSettings) {
            ScaleSettingsSheet(vm: vm)
        }
        .sheet(isPresented: $vm.showScaleConnection) {
            ScaleConnectionSheet()
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        GeometryReader { geo in
            let feedHeight = geo.size.width * 3 / 4

            VStack(spacing: 0) {
                // Top navigation bar — shown in non-camera mode only.
                // Camera mode uses an overlay bar that floats over the camera feed.
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

                    // Camera adaptive top bar — floats over camera, always visible in camera mode
                    if vm.barcodeModeActive {
                        cameraAdaptiveTopBar
                    }

                    // Floating caption / edit row
                    if vm.textDisplayMode != .off {
                        VStack {
                            Spacer()
                                .allowsHitTesting(false)
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
            // Camera feed — fixed background (parallax: sheet scrolls over it)
            if vm.cameraPermissionGranted {
                KitchenCameraPreview(session: KitchenCameraSession.shared.captureSession)
                    .frame(height: feedHeight)
                    .clipped()
            } else {
                Color.black
                    .frame(height: feedHeight)
            }

            // Scrollable content: camera controls area + sheet
            ScrollView {
                VStack(spacing: 0) {
                    // Camera controls area — transparent so camera shows through.
                    // Controls and tap gestures live here so they scroll away with the sheet.
                    ZStack {
                        Color.clear

                        // Bottom-right: flash + flip buttons
                        // Fade out progressively as they scroll toward the fixed top bar save button.
                        // Flash (higher up) fades first, flip fades second.
                        VStack {
                            Spacer()
                            HStack {
                                Spacer()
                                let fadeRange: CGFloat = 40
                                // Flash sits above flip: fades earlier
                                let flashThreshold = feedHeight - 148
                                let flashOpacity = max(0, min(1, (flashThreshold - cameraScrollOffset) / fadeRange))
                                // Flip sits lower: fades later
                                let flipThreshold = feedHeight - 104
                                let flipOpacity = max(0, min(1, (flipThreshold - cameraScrollOffset) / fadeRange))

                                VStack(spacing: Spacing.sm) {
                                    if vm.cameraFacing == .back && flashOpacity > 0 {
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
                                        .opacity(flashOpacity)
                                    }
                                    if flipOpacity > 0 {
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
                                        .opacity(flipOpacity)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.bottom, Spacing.md)

                        // Processing indicator — near bottom of camera area
                        if vm.isCameraProcessing {
                            cameraProcessingIndicator
                                .padding(.horizontal, Spacing.lg)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                                .padding(.bottom, Spacing.md)
                                .allowsHitTesting(true)
                        }

                        // Debug barcode card — near bottom of camera area
                        if let gtin = vm.debugBarcode {
                            debugBarcodeCard(gtin: gtin)
                                .padding(.horizontal, Spacing.lg)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                                .padding(.bottom, Spacing.md)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }

                        // Duplicate barcode toast
                        if let message = vm.duplicateScanMessage {
                            duplicateScanToast(message: message)
                                .padding(.horizontal, Spacing.lg)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                                .padding(.bottom, Spacing.md)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .frame(height: feedHeight)
                    .contentShape(Rectangle())
                    .onTapGesture(count: 2) {
                        vm.flipCamera()
                    }
                    .onTapGesture(count: 1) {
                        vm.captureAndIdentifyFood()
                        if vm.isCameraProcessing { cameraProcessingStartTime = Date() }
                    }
                    .background(
                        CameraScrollTracker { offsetY in
                            cameraControlsVisible = offsetY < 1
                            cameraScrollOffset = max(0, offsetY)
                        }
                    )

                    // Sheet header — rounded top corners
                    UnevenRoundedRectangle(topLeadingRadius: BorderRadius.xl,
                                           topTrailingRadius: BorderRadius.xl)
                        .fill(Color.appBackground)
                        .frame(height: 24 + Spacing.sm)

                    // Sheet body — cards
                    VStack(spacing: Spacing.md) {
                        // Scale card — hidden once readings flow to draft cards
                        if vm.shouldShowScaleCard {
                            KitchenScaleCard(
                                connectionState: vm.scaleState,
                                reading: vm.scaleReading,
                                showConnectedBanner: vm.showScaleConnectedBanner,
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
                    .background(
                        // Extend opaque background upward behind the rounded header
                        // to fill the corner gaps where camera would show through.
                        Color.appBackground
                            .padding(.top, -(24 + Spacing.sm))
                    )
                }
            }
            .scrollIndicators(.hidden)
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    // MARK: - Camera Adaptive Top Bar
    //
    // Always-visible top bar for camera mode. Adapts styling based on whether the
    // camera feed is visible (dark/frosted) or scrolled away (normal app scheme).

    private var cameraAdaptiveTopBar: some View {
        HStack(alignment: .top) {
            // Back / Cancel
            Button {
                handleCancel()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: cameraControlsVisible ? 18 : 20,
                                  weight: cameraControlsVisible ? .semibold : .medium))
                    .foregroundStyle(cameraControlsVisible ? .white : Color.appTextSecondary)
                    .frame(width: cameraControlsVisible ? 36 : 44,
                           height: cameraControlsVisible ? 36 : 44)
                    .background(cameraControlsVisible ? Color.black.opacity(0.55) : .clear)
                    .clipShape(Circle())
            }

            Spacer()

            // Macro pill — adapts color scheme
            VStack(spacing: 2) {
                if cameraControlsVisible {
                    inlineMacroPill
                        .environment(\.colorScheme, .dark)
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.xs)
                        .background(Color.black.opacity(0.55))
                        .clipShape(RoundedRectangle(cornerRadius: BorderRadius.lg))
                } else {
                    inlineMacroPill
                    if let dateLabel = vm.dateLabel {
                        Text(dateLabel)
                            .font(.appFootnote)
                            .tracking(Typography.Tracking.footnote)
                            .foregroundStyle(Color.appWarning)
                    }
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
        .padding(.vertical, cameraControlsVisible ? Spacing.md : Spacing.sm)
        .animation(.easeInOut(duration: 0.2), value: cameraControlsVisible)
    }

    // MARK: - Camera Processing Indicator

    private var cameraProcessingIndicator: some View {
        Button {
            showCameraProcessingDebug = true
        } label: {
            HStack(spacing: Spacing.sm) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .scaleEffect(0.85)
                Text("Identifying food…")
                    .font(.appSubhead)
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, Spacing.sm)
            .background(Color.black.opacity(0.6))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .alert("Camera Processing", isPresented: $showCameraProcessingDebug) {
            Button("OK", role: .cancel) {}
        } message: {
            let elapsed = cameraProcessingStartTime.map {
                String(format: "%.1fs ago", Date().timeIntervalSince($0))
            } ?? "unknown"
            Text("State: waiting for Gemini Live response\nPhoto sent: \(elapsed)\nExpect draft cards to appear when complete.")
        }
    }

    // MARK: - Shared Card Builder

    private func draftCard(item: DraftItem, heroMinHeight: CGFloat? = nil) -> some View {
        DraftMealCard(
            item: item,
            isHero: item.id == vm.heroId,
            isEditing: item.id == vm.editingItemId,
            heroMinHeight: heroMinHeight,
            scaleReading: vm.isScaleConnected ? vm.adjustedScaleReading : nil,
            scaleSkipped: vm.scaleSkippedIds.contains(item.id),
            isScaleConnected: vm.isScaleConnected,
            itemHasWeightUnit: vm.itemHasWeightUnit(item),
            autoConfirmed: vm.autoConfirmedItemId == item.id,
            hasZeroOffset: vm.zeroOffset != nil,
            keepZeroOffset: vm.keepZeroOffset,
            isSubtractiveMode: vm.isInSubtractiveMode(item.id),
            subtractiveStartWeight: vm.subtractiveStartWeight,
            subtractiveDelta: vm.subtractiveDelta,
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
            onReweigh: {
                vm.reweighItem(itemId: item.id)
            },
            onChoiceCreate: { name in
                vm.choiceCreateFood(itemId: item.id, name: name)
            },
            onSearchManually: { name in
                // For barcode-triggered choices, open search with empty query
                let isBarcodeName = !name.isEmpty && name.allSatisfy(\.isNumber)
                vm.pendingSearchName = isBarcodeName ? nil : name
                vm.showFoodSearch = true
                if isBarcodeName { vm.pendingBarcodeGtin = nil }
            },
            onSelectDisambiguateOption: { option in
                vm.selectDisambiguateOption(itemId: item.id, option: option)
            },
            onTapToExpand: {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    vm.expandItem(item.id)
                }
            },
            onZeroScale: {
                vm.zeroScale()
            },
            onClearZero: {
                vm.clearZero()
            },
            onToggleKeepZero: {
                vm.keepZeroOffset.toggle()
            },
            onStartSubtractive: {
                vm.startSubtractiveMode(for: item.id)
            },
            onCancelSubtractive: {
                vm.cancelSubtractiveMode()
            },
            onConfirmSubtractive: {
                vm.confirmSubtractiveDelta(for: item.id)
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
                            // Scale card (hidden once readings flow to draft cards)
                            if vm.shouldShowScaleCard {
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

    // MARK: - Duplicate Scan Toast

    private func duplicateScanToast(message: String) -> some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "xmark.circle")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))

            Text(message)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
        .background(Color.red.opacity(0.6))
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
            // Voice toggle — long press for audio settings
            Image(systemName: vm.audioActive ? "mic.fill" : "mic.slash")
                .font(.system(size: 22))
                .foregroundStyle(vm.audioActive ? Color.appTint : Color.appTextSecondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .onTapGesture { vm.toggleVoice() }
                .contextMenu {
                    Button {} label: {
                        Label("Audio Feedback (Coming Soon)", systemImage: "speaker.wave.2")
                    }
                    .disabled(true)
                }

            // Camera toggle — long press for camera settings
            Image(systemName: "camera")
                .font(.system(size: 22))
                .foregroundStyle(vm.barcodeModeActive ? Color.appTint : Color.appTextSecondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .onTapGesture { vm.toggleBarcodeMode() }
                .contextMenu {
                    Button { vm.toggleBarcodeMode() } label: {
                        Label("Barcode Scanning",
                              systemImage: vm.barcodeModeActive ? "checkmark" : "barcode.viewfinder")
                    }
                    Button {} label: {
                        Label("Food Identification (Coming Soon)", systemImage: "sparkles")
                    }
                    .disabled(true)
                }

            Spacer()

            // Listening indicator — center (only when voice is active)
            if vm.audioActive {
                ListeningIndicator(
                    state: vm.listeningState,
                    onPress: { vm.togglePause() }
                )
            }

            Spacer()

            // Scale — tap to toggle, long press for connection settings
            Image(systemName: vm.isScaleConnected ? "scalemass.fill" : "scalemass")
                .font(.system(size: 22))
                .foregroundStyle(vm.scaleState.isActive ? Color.appTint : Color.appTextSecondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .onTapGesture { vm.toggleScale() }
                .onLongPressGesture { vm.scaleIconLongPressed() }

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
        // "Save" now means "save for now" (pause) — session remains resumable
        vm.pause()
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

// MARK: - Camera Scroll Tracker
//
// UIViewRepresentable that walks up the UIKit hierarchy to find the parent
// UIScrollView and observes its contentOffset via KVO. This fires on every
// scroll frame — unlike SwiftUI PreferenceKey which only fires on view-tree
// re-renders and misses live-scroll updates.

private struct CameraScrollTracker: UIViewRepresentable {
    let onOffsetChange: (CGFloat) -> Void

    func makeUIView(context: Context) -> TrackerView {
        TrackerView(onOffsetChange: onOffsetChange)
    }

    func updateUIView(_ uiView: TrackerView, context: Context) {
        uiView.onOffsetChange = onOffsetChange
    }

    final class TrackerView: UIView {
        var onOffsetChange: (CGFloat) -> Void
        private var observation: NSKeyValueObservation?

        init(onOffsetChange: @escaping (CGFloat) -> Void) {
            self.onOffsetChange = onOffsetChange
            super.init(frame: .zero)
            backgroundColor = .clear
            isUserInteractionEnabled = false
        }

        required init?(coder: NSCoder) { fatalError() }

        override func didMoveToSuperview() {
            super.didMoveToSuperview()
            observation = nil
            var view: UIView? = superview
            while let v = view {
                if let sv = v as? UIScrollView {
                    // UIScrollView.contentOffset always changes on the main thread.
                    observation = sv.observe(\.contentOffset, options: .new) { [weak self] sv, _ in
                        self?.onOffsetChange(sv.contentOffset.y)
                    }
                    return
                }
                view = v.superview
            }
        }
    }
}

// MARK: - Scale Settings Sheet

@MainActor
private struct ScaleSettingsSheet: View {
    @Bindable var vm: KitchenModeViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // MARK: Auto-Progression
                Section {
                    Toggle("Auto-Progression", isOn: $vm.autoProgressionEnabled)
                        .tint(Color.appTint)
                } footer: {
                    Text("Scanning a new barcode automatically confirms the current item's weight and zeros the scale.")
                        .font(.appCaption1)
                }

                if vm.autoProgressionEnabled {
                    Section("Auto-Progression Settings") {
                        Toggle("Auto-Zero After Confirm", isOn: $vm.autoProgressionAutoZero)
                            .tint(Color.appTint)

                        Toggle("Confirmation Sound", isOn: $vm.autoProgressionSound)
                            .tint(Color.appTint)

                        Toggle("Voice Chain Confirm", isOn: $vm.autoProgressionVoiceChain)
                            .tint(Color.appTint)
                    }

                    Section {
                        Toggle("Auto-Confirm on Stable Weight", isOn: $vm.autoProgressionTimerEnabled)
                            .tint(Color.appTint)

                        if vm.autoProgressionTimerEnabled {
                            VStack(alignment: .leading, spacing: Spacing.sm) {
                                HStack {
                                    Text("Delay")
                                        .font(.appBody)
                                        .foregroundStyle(Color.appText)
                                    Spacer()
                                    Text(String(format: "%.1fs", vm.autoProgressionTimerSeconds))
                                        .font(.appBody)
                                        .foregroundStyle(Color.appTextSecondary)
                                        .monospacedDigit()
                                }
                                Slider(
                                    value: $vm.autoProgressionTimerSeconds,
                                    in: 1.5...5.0,
                                    step: 0.5
                                )
                                .tint(Color.appTint)
                                HStack {
                                    Text("1.5s")
                                        .font(.appCaption1)
                                        .foregroundStyle(Color.appTextTertiary)
                                    Spacer()
                                    Text("5.0s")
                                        .font(.appCaption1)
                                        .foregroundStyle(Color.appTextTertiary)
                                }
                            }
                        }
                    } footer: {
                        Text("Automatically confirm weight after the reading stays stable for the set duration.")
                            .font(.appCaption1)
                    }
                }

                // MARK: Scale Connection
                Section("Scale") {
                    HStack {
                        Label {
                            Text(scaleStatusText)
                                .font(.appBody)
                                .foregroundStyle(Color.appText)
                        } icon: {
                            Image(systemName: scaleStatusIcon)
                                .foregroundStyle(scaleStatusColor)
                        }
                        Spacer()
                        scaleActionButton
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Scale Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.appTint)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: vm.autoProgressionEnabled)
            .animation(.easeInOut(duration: 0.25), value: vm.autoProgressionTimerEnabled)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Scale Status Helpers

    private var scaleStatusText: String {
        switch vm.scaleState {
        case .idle: return "Not connected"
        case .scanning: return "Scanning..."
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .error(let msg): return msg
        }
    }

    private var scaleStatusIcon: String {
        switch vm.scaleState {
        case .idle: return "antenna.radiowaves.left.and.right.slash"
        case .scanning, .connecting: return "antenna.radiowaves.left.and.right"
        case .connected: return "checkmark.circle.fill"
        case .error: return "exclamationmark.triangle.fill"
        }
    }

    private var scaleStatusColor: Color {
        switch vm.scaleState {
        case .idle: return Color.appTextTertiary
        case .scanning, .connecting: return Color.appTint
        case .connected: return Color.appSuccess
        case .error: return Color.appWarning
        }
    }

    @ViewBuilder
    private var scaleActionButton: some View {
        switch vm.scaleState {
        case .idle, .error:
            Button("Connect") { vm.connectScale() }
                .font(.appSubhead)
                .foregroundStyle(Color.appTint)
        case .scanning, .connecting:
            Button("Cancel") { vm.cancelScaleScan() }
                .font(.appSubhead)
                .foregroundStyle(Color.appTextSecondary)
        case .connected:
            Button("Disconnect") { vm.disconnectScale() }
                .font(.appSubhead)
                .foregroundStyle(Color.appDestructive)
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
