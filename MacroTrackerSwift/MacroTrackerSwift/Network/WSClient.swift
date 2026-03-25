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

    /// Called on the main actor when the connection closes.
    var onDisconnect: ((Error?) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var urlSession: URLSession?

    private override init() {}

    // MARK: - Connect / Disconnect

    func connect(date: String) {
        guard !isConnected else { return }

        let wsBase = Config.baseURL
            .replacingOccurrences(of: "http://", with: "ws://")
            .replacingOccurrences(of: "https://", with: "wss://")
        guard let url = URL(string: "\(wsBase)/ws/kitchen-mode?date=\(date)") else {
            return
        }

        // Wire all incoming messages to DraftStore
        onMessage = { DraftStore.shared.applyServerMessage($0) }

        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        urlSession  = session
        task        = session.webSocketTask(with: url)
        task?.resume()
        isConnected = true
        receiveLoop()
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
        task        = nil
        urlSession  = nil
        isConnected = false
    }

    // MARK: - Send

    func send(_ message: WSClientMessage) {
        guard let task else { return }
        do {
            let data = try JSONEncoder().encode(message)
            task.send(.data(data)) { error in
                if let error {
                    Task { @MainActor in
                        WSClient.shared.onDisconnect?(error)
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
                    WSClient.shared.isConnected = false
                    WSClient.shared.onDisconnect?(error)
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
        Task { @MainActor in self.isConnected = true }
    }

    nonisolated func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        Task { @MainActor in
            self.isConnected = false
            self.onDisconnect?(nil)
        }
    }
}
