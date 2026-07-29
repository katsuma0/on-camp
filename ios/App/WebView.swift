/* The single full-screen web view, plus everything that makes the web app
   feel native:
     - navigation policy: the app stays inside its local scheme; http(s)
       links (the official summary, Ontario Parks, the sibling apps) open in
       Safari, and mail/tel links go to the system.
     - share bridge: the injected script (Bridge.swift) forwards
       navigator.share() here, and the card image plus message text are
       handed to a real UIActivityViewController (iMessage and friends).
     - downloads: backup/export links (<a download> or blob:) become a
       share sheet with the exported file.
     - haptics: the web app's taps come through as light impact feedback.
     - JS dialogs: alert/confirm/prompt map to UIAlertController. */

import SwiftUI
import WebKit
import UIKit

struct WebScreen: UIViewRepresentable {
    func makeCoordinator() -> WebCoordinator { WebCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let coordinator = context.coordinator

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(LocalSchemeHandler(), forURLScheme: "app")
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()

        let controller = config.userContentController
        controller.add(coordinator, name: "share")
        controller.add(coordinator, name: "haptic")
        controller.addUserScript(WKUserScript(source: NativeBridge.script,
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = coordinator
        webView.uiDelegate = coordinator
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        coordinator.webView = webView
        webView.load(URLRequest(url: URL(string: "app://localhost/index.html")!))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

final class WebCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate,
                            WKScriptMessageHandler, WKDownloadDelegate {
    weak var webView: WKWebView?
    private var downloadURL: URL?

    // MARK: - Navigation policy

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let scheme = (url.scheme ?? "").lowercased()
        if navigationAction.shouldPerformDownload {
            // WKDownload fetches in the network process, which cannot see the
            // custom scheme handler, so app:// downloads are served straight
            // from the bundle instead. blob: downloads go the normal route.
            if scheme == "app" { decisionHandler(.cancel); shareBundledFile(at: url); return }
            decisionHandler(.download); return
        }
        switch scheme {
        case "app":
            decisionHandler(.allow)
        case "blob":
            decisionHandler(.download)
        case "http", "https", "mailto", "tel", "sms":
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        default:
            decisionHandler(.cancel)
        }
    }

    // An <a download> pointing at a bundled file: hand the file to a share sheet.
    private func shareBundledFile(at url: URL) {
        guard let resourceURL = Bundle.main.resourceURL else { return }
        let webRoot = resourceURL.appendingPathComponent("Web", isDirectory: true).standardizedFileURL
        let path = url.path
        guard !path.isEmpty, path != "/" else { return }
        let fileURL = webRoot.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard fileURL.path.hasPrefix(webRoot.path),
              FileManager.default.fileExists(atPath: fileURL.path) else { return }
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let dest = dir.appendingPathComponent(fileURL.lastPathComponent)
        try? FileManager.default.copyItem(at: fileURL, to: dest)
        presentShareSheet(items: [dest], completion: nil)
    }

    // target="_blank" links (the sibling apps, official sources)
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url,
           let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    // MARK: - Downloads (exports and saved cards become a share sheet)

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction,
                 didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse,
                 didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = suggestedFilename.isEmpty ? "export" : suggestedFilename
        let url = dir.appendingPathComponent(name)
        downloadURL = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloadURL else { return }
        downloadURL = nil
        presentShareSheet(items: [url], completion: nil)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadURL = nil
    }

    // MARK: - Bridge messages from the injected script

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "haptic":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "share":
            if let body = message.body as? [String: Any] { handleShare(body) }
        default:
            break
        }
    }

    private func handleShare(_ body: [String: Any]) {
        let id = body["id"] as? String ?? ""
        var items: [Any] = []

        if let files = body["files"] as? [[String: Any]] {
            let dir = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            for file in files {
                guard let b64 = file["data"] as? String,
                      let data = Data(base64Encoded: b64) else { continue }
                let rawName = (file["name"] as? String) ?? ""
                var name = (rawName as NSString).lastPathComponent
                if name.isEmpty { name = "card.png" }
                let url = dir.appendingPathComponent(name)
                do { try data.write(to: url); items.append(url) } catch {}
            }
        }
        if let text = body["text"] as? String, !text.isEmpty { items.append(text) }
        if items.isEmpty, let urlStr = body["url"] as? String, let url = URL(string: urlStr) {
            items.append(url)
        }
        guard !items.isEmpty else { resolveShare(id: id, status: "cancel"); return }

        presentShareSheet(items: items) { [weak self] completed in
            self?.resolveShare(id: id, status: completed ? "shared" : "cancel")
        }
    }

    private func resolveShare(id: String, status: String) {
        // ids are bridge-generated alphanumerics; filter anyway before they
        // are interpolated into JavaScript.
        let safe = id.filter { $0.isLetter || $0.isNumber || $0 == "-" }
        webView?.evaluateJavaScript(
            "window.__bridgeShareDone && window.__bridgeShareDone('\(safe)', '\(status)')",
            completionHandler: nil)
    }

    // MARK: - JS dialogs

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        // WebKit stalls the page's JS until the handler is called, so if there
        // is nowhere to present, answer immediately.
        guard let top = topViewController() else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        guard let top = topViewController() else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        guard let top = topViewController() else { completionHandler(nil); return }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        top.present(alert, animated: true)
    }

    // MARK: - Presentation helpers

    private func presentShareSheet(items: [Any], completion: ((Bool) -> Void)?) {
        // Never present without settling the completion; a dropped completion
        // would leave the page's share promise pending forever.
        guard let top = topViewController() else { completion?(false); return }
        let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
        activity.completionWithItemsHandler = { _, completed, _, _ in completion?(completed) }
        if let popover = activity.popoverPresentationController, let webView = webView {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX,
                                        y: webView.bounds.maxY - 80, width: 1, height: 1)
        }
        top.present(activity, animated: true)
    }

    private func topViewController() -> UIViewController? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        let window = windows.first { $0.isKeyWindow } ?? windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
