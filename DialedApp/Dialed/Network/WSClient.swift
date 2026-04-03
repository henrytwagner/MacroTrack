import Foundation

// MARK: - WSClient (Phase E — full implementation)

/// Manages the WebSocket connection to /ws/kitchen-mode.
/// Encodes outgoing WSClientMessage and decodes incoming WSServerMessage.
/// Routes all incoming messages to DraftStore.shared.applyServerMessage.
@MainActor
final class WSClient: NSObject {
    static let shared = WSClient()

    // MARK: - State

    private(set) var isConnected: Bool = false

    /// Called on the main actor for every decoded server message.
    var onMessage: ((WSServerMessage) -> Void)?

    /// Called on the main actor when the connection closes (after all reconnect attempts exhausted).
    var onDisconnect: ((Error?) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var urlSession: URLSession?

    // Reconnect state
    private var lastDate: String?
    private var lastSessionId: String?
    private var reconnectAttempts = 0
    private var intentionalDisconnect = false
    private static let maxReconnectAttempts = 4
    private static let baseReconnectDelay: TimeInterval = 1.0  // 1s, 2s, 4s, 8s

    // Ping/pong heartbeat
    private var pingTimer: Timer?
    private static let pingInterval: TimeInterval = 15.0

    private override init() {}

    // MARK: - Connect / Disconnect

    func connect(date: String, sessionId: String? = nil) {
        guard !isConnected else { return }

        lastDate = date
        lastSessionId = sessionId
        intentionalDisconnect = false
        reconnectAttempts = 0

        performConnect(date: date, sessionId: sessionId)
    }

    private func performConnect(date: String, sessionId: String?) {
        let wsBase = Config.baseURL
            .replacingOccurrences(of: "http://", with: "ws://")
            .replacingOccurrences(of: "https://", with: "wss://")
        let token = KeychainService.load(key: "accessToken") ?? ""
        var urlStr = "\(wsBase)/ws/kitchen-mode?date=\(date)&token=\(token)"
        if let sessionId {
            urlStr += "&sessionId=\(sessionId)"
        }
        guard let url = URL(string: urlStr) else {
            return
        }

        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true

        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        urlSession  = session
        task        = session.webSocketTask(with: url)
        task?.resume()
        isConnected = true
        receiveLoop()
        startPing()
    }

    func disconnect() {
        intentionalDisconnect = true
        stopPing()
        task?.cancel(with: .normalClosure, reason: nil)
        task        = nil
        urlSession  = nil
        isConnected = false
    }

    // MARK: - Reconnect

    private func attemptReconnect() {
        guard !intentionalDisconnect,
              reconnectAttempts < Self.maxReconnectAttempts,
              let date = lastDate else {
            // Exhausted retries or intentional disconnect — notify caller
            onDisconnect?(nil)
            return
        }

        reconnectAttempts += 1
        let delay = Self.baseReconnectDelay * pow(2.0, Double(reconnectAttempts - 1))
        print("[WSClient] reconnect attempt \(reconnectAttempts)/\(Self.maxReconnectAttempts) in \(delay)s")

        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !self.intentionalDisconnect else { return }
            self.performConnect(date: date, sessionId: self.lastSessionId)
        }
    }

    // MARK: - Ping / Pong Heartbeat

    private func startPing() {
        stopPing()
        pingTimer = Timer.scheduledTimer(withTimeInterval: Self.pingInterval, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor [self] in
                self.sendPing()
            }
        }
    }

    private func stopPing() {
        pingTimer?.invalidate()
        pingTimer = nil
    }

    private func sendPing() {
        task?.sendPing { [weak self] error in
            if let error {
                guard let self else { return }
                Task { @MainActor [self] in
                    guard !self.intentionalDisconnect else { return }
                    print("[WSClient] ping failed: \(error.localizedDescription)")
                    self.isConnected = false
                    self.stopPing()
                    self.attemptReconnect()
                }
            }
        }
    }

    // MARK: - Send

    func send(_ message: WSClientMessage) {
        guard let task else { return }
        do {
            let data = try JSONEncoder().encode(message)
            task.send(.data(data)) { error in
                if let error {
                    Task { @MainActor in
                        guard !WSClient.shared.intentionalDisconnect else { return }
                        print("[WSClient] send error: \(error.localizedDescription)")
                    }
                }
            }
        } catch {
            #if DEBUG
            print("[WSClient] Encode error: \(error)")
            #endif
        }
    }

    // MARK: - Receive Loop

    private func receiveLoop() {
        task?.receive { result in
            switch result {
            case .success(let msg):
                Task { @MainActor in
                    WSClient.shared.handleRaw(msg)
                    WSClient.shared.receiveLoop()
                }
            case .failure(let error):
                Task { @MainActor in
                    guard !WSClient.shared.intentionalDisconnect else { return }
                    print("[WSClient] receive error: \(error.localizedDescription)")
                    WSClient.shared.isConnected = false
                    WSClient.shared.stopPing()
                    WSClient.shared.attemptReconnect()
                }
            }
        }
    }

    private func handleRaw(_ message: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch message {
        case .data(let d):   data = d
        case .string(let s): data = s.data(using: .utf8)
        @unknown default:    data = nil
        }
        guard let data else { return }
        do {
            let decoded = try JSONDecoder().decode(WSServerMessage.self, from: data)
            // Successful message means connection is alive — reset reconnect counter
            reconnectAttempts = 0
            onMessage?(decoded)
        } catch {
            #if DEBUG
            print("[WSClient] Decode error: \(error)")
            if let raw = String(data: data, encoding: .utf8) {
                print("[WSClient] Raw message: \(raw)")
            }
            #endif
        }
    }
}

// MARK: - URLSessionWebSocketDelegate

extension WSClient: URLSessionWebSocketDelegate {
    nonisolated func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        Task { @MainActor in
            self.isConnected = true
            self.reconnectAttempts = 0
        }
    }

    nonisolated func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        Task { @MainActor in
            self.isConnected = false
            self.stopPing()
            if closeCode != .normalClosure && !self.intentionalDisconnect {
                self.attemptReconnect()
            }
        }
    }
}
