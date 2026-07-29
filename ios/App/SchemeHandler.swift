/* Serves the bundled web app (Resources/Web) to the WKWebView over
   app://localhost/. A custom scheme (the same architecture Capacitor uses)
   gives the page a stable origin, so localStorage and IndexedDB persist in
   the app's container, and relative fetches (like ./parks-data.json) are
   answered from the bundle. */

import Foundation
import WebKit

final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    private let lock = NSLock()
    private var liveTasks = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask)
        lock.lock(); liveTasks.insert(id); lock.unlock()

        let requestURL = urlSchemeTask.request.url
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let (response, data) = Self.load(requestURL)
            DispatchQueue.main.async {
                // Never touch a task the web view has already stopped.
                self.lock.lock(); let alive = self.liveTasks.contains(id); self.lock.unlock()
                guard alive else { return }
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(data)
                urlSchemeTask.didFinish()
                self.lock.lock(); self.liveTasks.remove(id); self.lock.unlock()
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask)
        lock.lock(); liveTasks.remove(id); lock.unlock()
    }

    // MARK: - File loading

    private static func load(_ url: URL?) -> (HTTPURLResponse, Data) {
        let requestURL = url ?? URL(string: "app://localhost/")!
        guard let resourceURL = Bundle.main.resourceURL else {
            return notFound(requestURL)
        }
        let webRoot = resourceURL.appendingPathComponent("Web", isDirectory: true)
            .standardizedFileURL

        var path = requestURL.path
        if path.isEmpty || path == "/" { path = "/index.html" }

        let fileURL = webRoot.appendingPathComponent(String(path.dropFirst()))
            .standardizedFileURL
        guard fileURL.path.hasPrefix(webRoot.path),
              let data = try? Data(contentsOf: fileURL) else {
            return notFound(requestURL)
        }

        let headers = [
            "Content-Type": mime(for: fileURL.pathExtension.lowercased()),
            "Content-Length": String(data.count),
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        ]
        let response = HTTPURLResponse(url: requestURL, statusCode: 200,
                                       httpVersion: "HTTP/1.1", headerFields: headers)!
        return (response, data)
    }

    private static func notFound(_ url: URL) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "text/plain"])!
        return (response, Data("Not found".utf8))
    }

    private static func mime(for ext: String) -> String {
        switch ext {
        case "html": return "text/html; charset=utf-8"
        case "js": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}
