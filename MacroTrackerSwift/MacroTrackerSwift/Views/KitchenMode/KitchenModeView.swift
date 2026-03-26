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

                    // Floating macro pill overlay
                    macroPillOverlay
                        .padding(.horizontal, Spacing.md)
                        .padding(.top, vm.barcodeModeActive ? feedHeight - 24 : Spacing.sm)
                        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: vm.barcodeModeActive)

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
        cardList(topPadding: 64, emptyIcon: "mic",
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
            // Double-tap anywhere in the overlay area also flips the camera
            cameraNavOverlay
                .padding(.top, Spacing.md)
                .padding(.horizontal, Spacing.lg)
                .frame(height: feedHeight, alignment: .top)
                .contentShape(Rectangle())
                .onTapGesture(count: 2) {
                    vm.flipCamera()
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
        HStack {
            // Back / Cancel
            Button {
                handleCancel()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.black.opacity(0.35))
                    .clipShape(Circle())
            }

            Spacer()

            // Flash toggle (back camera only)
            if vm.cameraFacing == .back {
                Button {
                    vm.toggleFlash()
                } label: {
                    Image(systemName: vm.flashEnabled ? "bolt.fill" : "bolt.slash")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(Color.black.opacity(0.35))
                        .clipShape(Circle())
                }
            }

            // Flip camera
            Button {
                vm.flipCamera()
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.black.opacity(0.35))
                    .clipShape(Circle())
            }

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
        }
    }

    // MARK: - Shared Card Builder

    private func draftCard(item: DraftItem) -> some View {
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
    }

    // MARK: - Card List (normal mode — uses List for swipe actions)

    private func cardList(topPadding: CGFloat, emptyIcon: String, emptyText: String) -> some View {
        ScrollViewReader { proxy in
            List {
                if vm.items.isEmpty {
                    VStack(spacing: Spacing.md) {
                        Image(systemName: emptyIcon)
                            .font(.system(size: 48))
                            .foregroundStyle(Color.appTextTertiary)

                        Text(emptyText)
                            .font(.appBody)
                            .tracking(Typography.Tracking.body)
                            .foregroundStyle(Color.appTextSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, Spacing.xl)
                    .padding(.vertical, Spacing.xxxl)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(
                        top: Spacing.xxxl, leading: Spacing.xl,
                        bottom: Spacing.xxxl, trailing: Spacing.xl))
                } else {
                    ForEach(vm.reversedItems, id: \.id) { item in
                        draftCard(item: item)
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
            .contentMargins(.top, topPadding, for: .scrollContent)
            .contentMargins(.bottom, Spacing.lg, for: .scrollContent)
            .onChange(of: vm.items.count) { _, _ in
                if let firstId = vm.reversedItems.first?.id {
                    withAnimation {
                        proxy.scrollTo(firstId, anchor: .top)
                    }
                }
            }
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
        let radius: CGFloat = 20

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

    private func handleSave() {
        guard case .active = vm.sessionState else { return }
        let incompleteItems = vm.items.filter { $0.state != .normal }
        if incompleteItems.isEmpty {
            vm.save()
        } else {
            showSaveAlert = true
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

// MARK: - Preview

#Preview {
    KitchenModeView(onDismiss: {})
        .environment(DailyLogStore.shared)
        .environment(GoalStore.shared)
        .environment(DateStore.shared)
        .environment(DraftStore.shared)
}
