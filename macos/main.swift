// Coco · French for macOS: a native window around the offline course.
// The course files live in the app bundle (Contents/Resources/web) and are served by LocalServer on
// 127.0.0.1. Progress is kept by WebKit's persistent website data store for that origin.
import Cocoa
import WebKit

let appPort: UInt16 = 47615 // fixed, so saved progress (tied to the page's address) is always found again

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var web: WKWebView!
    private var server: LocalServer!
    private var crashTimes: [Date] = []
    private var downloadTargets: [ObjectIdentifier: (temp: URL, final: URL)] = [:]
    private var isHeadless: Bool { selfTest || snapshotArgs != nil }
    private func isOurPage(_ url: URL?) -> Bool { url?.host == "127.0.0.1" && url?.port == Int(appPort) }
    private let selfTest = CommandLine.arguments.contains("--selftest")
    // --snapshot <file.png> [#/route]: render the window to an image and quit (used to check the layout).
    private lazy var snapshotArgs: (path: String, route: String)? = {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count else { return nil }
        return (args[i + 1], i + 2 < args.count ? args[i + 2] : "#/")
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web")
        server = LocalServer(root: webRoot)
        server.start(port: appPort) { [weak self] error in
            guard let self else { return }
            if let error {
                self.fail("Coco · French couldn't start its local page server on port \(appPort).\n\n\(error.localizedDescription)\n\nIs another copy of the app already open?")
                return
            }
            self.openWindow()
        }
    }

    private func openWindow() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persistent: progress survives restarts
        config.mediaTypesRequiringUserActionForPlayback = [] // pronunciation plays automatically
        config.preferences.isElementFullscreenEnabled = true
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = true
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Coco · French"
        window.minSize = NSSize(width: 380, height: 560)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("CocoMainWindow")
        if !selfTest && snapshotArgs == nil { window.makeKeyAndOrderFront(nil) }
        NSApp.activate(ignoringOtherApps: true)
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(appPort)/index.html")!))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // MARK: - Page loaded (and the optional self-test)

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let snap = snapshotArgs { return takeSnapshot(snap.path, route: snap.route) }
        guard selfTest else { return }
        // Checks the things that only work inside the real app: storage, WebGPU, and offline speech recognition.
        let js = """
        const out = { ok: true };
        out.storage = (() => { try { localStorage.setItem('selftest', '1'); return localStorage.getItem('selftest') === '1'; } catch (e) { return false; } })();
        out.webgpu = !!(navigator.gpu && await navigator.gpu.requestAdapter());
        out.mic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        out.units = window.FR_DATA ? FR_DATA.units.length : 0;
        try {
          const w = new Worker('js/asr-worker.js', { type: 'module' });
          const send = (msg, t) => new Promise((res, rej) => { w.onmessage = ({ data }) => { if (data.type === 'progress') return; data.type === 'error' ? rej(new Error(data.message)) : res(data); }; w.onerror = (e) => rej(new Error('worker error ' + (e.message || ''))); w.postMessage(msg, t || []); });
          const t0 = performance.now();
          const r0 = await send({ type: 'load' });
          out.backend = r0.backend; out.loadMs = Math.round(performance.now() - t0);
          const ctx = new AudioContext(); const dec = await ctx.decodeAudioData(await (await fetch('assets/audio/u01-01.m4a')).arrayBuffer()); ctx.close();
          const off = new OfflineAudioContext(1, Math.ceil(dec.duration * 16000), 16000); const s = off.createBufferSource(); s.buffer = dec; s.connect(off.destination); s.start();
          const pcm = (await off.startRendering()).getChannelData(0).slice();
          const t1 = performance.now();
          const r = await send({ type: 'transcribe', id: 1, audio: pcm, hint: 'bonjour, bonsoir, salut, merci.' }, [pcm.buffer]);
          out.heard = r.text; out.recognizeMs = Math.round(performance.now() - t1);
          w.terminate();
        } catch (e) { out.ok = false; out.error = String(e.message || e); }
        return JSON.stringify(out);
        """
        webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): print("SELFTEST", value as? String ?? "\(value)")
            case .failure(let error): print("SELFTEST failed:", error.localizedDescription)
            }
            fflush(stdout)
            NSApp.terminate(nil)
        }
    }

    private func takeSnapshot(_ path: String, route: String) {
        web.evaluateJavaScript("location.hash = '\(route)'; document.documentElement.classList.add('snapshot')")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.web.takeSnapshot(with: nil) { image, _ in
                if let tiff = image?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
                   let png = rep.representation(using: .png, properties: [:]) {
                    try? png.write(to: URL(fileURLWithPath: path))
                    print("SNAPSHOT", path)
                } else { print("SNAPSHOT failed") }
                NSApp.terminate(nil)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if selfTest { print("SELFTEST failed: navigation", error.localizedDescription); NSApp.terminate(nil) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Reload after a crash, but stop if it keeps crashing.
        crashTimes = crashTimes.filter { $0.timeIntervalSinceNow > -60 } + [Date()]
        if crashTimes.count <= 3 { webView.reload(); return }
        fail("The page stopped working several times in a row. Please quit and reopen Coco · French.")
    }

    // MARK: - Links, downloads (backup export)

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        if navigationAction.shouldPerformDownload { return decisionHandler(.download, preferences) }
        let url = navigationAction.request.url
        let internalScheme = ["blob", "about", "data"].contains(url?.scheme ?? "")
        if let url, !internalScheme, !isOurPage(url) {
            NSWorkspace.shared.open(url) // never browse the web inside the app
            return decisionHandler(.cancel, preferences)
        }
        decisionHandler(.allow, preferences)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.directoryURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        panel.beginSheetModal(for: window) { [weak self] answer in
            guard answer == .OK, let url = panel.url else { return completionHandler(nil) }
            // Download to a temporary file first; an existing backup is only replaced once this one is complete.
            let temp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + suggestedFilename)
            self?.downloadTargets[ObjectIdentifier(download)] = (temp, url)
            completionHandler(temp)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let target = downloadTargets.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            if FileManager.default.fileExists(atPath: target.final.path) {
                _ = try FileManager.default.replaceItemAt(target.final, withItemAt: target.temp)
            } else {
                try FileManager.default.moveItem(at: target.temp, to: target.final)
            }
        } catch {
            showAlert("The backup couldn't be saved.", detail: error.localizedDescription)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let target = downloadTargets.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: target.temp) }
        showAlert("The backup couldn't be saved.", detail: error.localizedDescription)
    }

    private func showAlert(_ message: String, detail: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = detail
        alert.beginSheetModal(for: window)
    }

    // MARK: - Page dialogs: file picker (backup import), alert, confirm, microphone

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.json]
        panel.beginSheetModal(for: window) { answer in completionHandler(answer == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        if isHeadless { return completionHandler() } // no visible window to attach a sheet to
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        if isHeadless { return completionHandler(false) }
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // Only our own page may use the microphone (macOS still asks you once, system-wide).
        decisionHandler(origin.host == "127.0.0.1" && origin.port == Int(appPort) && type == .microphone ? .grant : .deny)
    }

    // MARK: - Menus

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Coco · French", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Coco · French", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Coco · French", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let goItem = NSMenuItem(); main.addItem(goItem)
        let go = NSMenu(title: "Go")
        for (title, hash, key) in [("Learn", "#/", "1"), ("Review", "#/review", "2"), ("Progress", "#/progress", "3"), ("Settings", "#/settings", "4")] {
            let item = NSMenuItem(title: title, action: #selector(goTo(_:)), keyEquivalent: key)
            item.representedObject = hash
            item.target = self
            go.addItem(item)
        }
        go.addItem(.separator())
        let reload = NSMenuItem(title: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        reload.target = self
        go.addItem(reload)
        goItem.submenu = go

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.zoom(_:)), keyEquivalent: "")
        let fullScreen = NSMenuItem(title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.control, .command]
        windowMenu.addItem(fullScreen)
        windowItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = main
    }

    @objc private func goTo(_ sender: NSMenuItem) {
        guard let hash = sender.representedObject as? String else { return }
        web?.evaluateJavaScript("location.hash = '\(hash)'")
    }

    @objc private func reloadPage() { web?.reload() }

    private func fail(_ message: String) {
        if selfTest { print("SELFTEST failed:", message); exit(1) }
        let alert = NSAlert()
        alert.messageText = "Coco · French"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
let headless = CommandLine.arguments.contains("--selftest") || CommandLine.arguments.contains("--snapshot")
app.setActivationPolicy(headless ? .prohibited : .regular)
app.run()
