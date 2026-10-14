// A tiny static file server bound to 127.0.0.1 only. The app's web page is served from here
// (not file://) so that the microphone, WebGPU and module workers work, since browsers treat
// localhost as a secure context. Supports GET/HEAD and byte ranges (needed for audio playback).
import Foundation
import Network

final class LocalServer {
    private let root: URL
    private var expectedHost = ""
    private var listener: NWListener?
    private static let chunk = 1 << 20 // stream bodies in 1 MB pieces instead of copying whole files
    private let queue = DispatchQueue(label: "local-server", attributes: .concurrent)

    static let csp = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'"

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    func start(port: UInt16, ready: @escaping (Error?) -> Void) {
        expectedHost = "127.0.0.1:\(port)"
        do {
            let params = NWParameters.tcp
            params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
            params.allowLocalEndpointReuse = true
            let listener = try NWListener(using: params)
            listener.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready: DispatchQueue.main.async { ready(nil) }
                case .failed(let err): DispatchQueue.main.async { ready(err) }
                default: break
                }
            }
            listener.start(queue: queue)
            self.listener = listener
        } catch {
            ready(error)
        }
    }

    private func accept(_ conn: NWConnection) {
        conn.start(queue: queue)
        // Drop connections that never send a request.
        queue.asyncAfter(deadline: .now() + 30) { if conn.state != .cancelled { conn.cancel() } }
        receiveHeader(conn, buffer: Data())
    }

    private func receiveHeader(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, done, err in
            guard let self else { return }
            var buf = buffer
            if let data { buf.append(data) }
            if let end = buf.range(of: Data("\r\n\r\n".utf8)) {
                self.respond(conn, header: String(decoding: buf[..<end.lowerBound], as: UTF8.self))
            } else if done || err != nil || buf.count > 64 * 1024 {
                conn.cancel()
            } else {
                self.receiveHeader(conn, buffer: buf)
            }
        }
    }

    private func respond(_ conn: NWConnection, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let parts = (lines.first ?? "").split(separator: " ")
        guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else { return send(conn, status: "405 Method Not Allowed") }
        let isHead = parts[0] == "HEAD"
        var rangeHeader: String?
        var host = ""
        for line in lines.dropFirst() {
            let lower = line.lowercased()
            if lower.hasPrefix("range:") { rangeHeader = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces) }
            if lower.hasPrefix("host:") { host = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces) }
        }
        // Only the app's own page may read files (blocks DNS-rebinding style requests).
        guard host == expectedHost else { return send(conn, status: "403 Forbidden") }

        // Resolve the path inside the web root; refuse anything outside it and dotfiles.
        var path = String(parts[1].split(separator: "?", maxSplits: 1).first ?? "/")
        path = path.removingPercentEncoding ?? path
        if path == "/" { path = "/index.html" }
        if path.split(separator: "/").contains(where: { $0.hasPrefix(".") }) { return send(conn, status: "404 Not Found") }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"),
              let data = try? Data(contentsOf: file, options: .alwaysMapped) else {
            return send(conn, status: "404 Not Found")
        }

        var status = "200 OK"
        var range = 0..<data.count
        var extra = ""
        // Single byte ranges only; anything we can't parse is ignored and the whole file is sent (200).
        if let r = rangeHeader, r.hasPrefix("bytes="), !r.contains(",") {
            let total = data.count
            let spec = r.dropFirst(6).split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            var bounds: (Int, Int)?
            if spec.count == 2, spec[0].isEmpty, let suffix = Int(spec[1]) {            // bytes=-N
                bounds = (max(0, total - suffix), total - 1)
            } else if spec.count == 2, let start = Int(spec[0]) {                         // bytes=S- or S-E
                bounds = spec[1].isEmpty ? (start, total - 1) : Int(spec[1]).map { (start, min($0, total - 1)) }
            }
            if let (start, end) = bounds {
                if start > end || start >= total {
                    return send(conn, status: "416 Range Not Satisfiable", extra: "Content-Range: bytes */\(total)\r\n")
                }
                status = "206 Partial Content"
                range = start..<(end + 1)
                extra = "Content-Range: bytes \(start)-\(end)/\(total)\r\n"
            }
        }
        let head = responseHead(status: status, type: Self.mime(file.pathExtension), length: range.count, extra: extra)
        conn.send(content: head, completion: .contentProcessed { [weak self] err in
            guard err == nil, !isHead else { return conn.cancel() }
            self?.stream(conn, data: data, from: range.lowerBound, to: range.upperBound)
        })
    }

    // Sends the body piece by piece; only one 1 MB copy is alive at a time.
    private func stream(_ conn: NWConnection, data: Data, from: Int, to: Int) {
        guard from < to else { return conn.cancel() }
        let end = min(to, from + Self.chunk)
        conn.send(content: data.subdata(in: from..<end), completion: .contentProcessed { [weak self] err in
            if err != nil { return conn.cancel() }
            self?.stream(conn, data: data, from: end, to: to)
        })
    }

    private func responseHead(status: String, type: String, length: Int, extra: String) -> Data {
        Data(("HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(length)\r\n" +
            "Accept-Ranges: bytes\r\nCache-Control: no-cache\r\nContent-Security-Policy: \(Self.csp)\r\n" +
            "\(extra)Connection: close\r\n\r\n").utf8)
    }

    // Small responses without a body (errors).
    private func send(_ conn: NWConnection, status: String, extra: String = "") {
        conn.send(content: responseHead(status: status, type: "text/plain", length: 0, extra: extra),
                  completion: .contentProcessed { _ in conn.cancel() })
    }

    private static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "m4a": return "audio/mp4"
        case "wasm": return "application/wasm"
        case "txt", "md": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
