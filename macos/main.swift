// Coco · French for macOS: a native window around the offline course.
// The course files live in the app bundle (Contents/Resources/web) and are served by LocalServer on
// 127.0.0.1. Progress is kept by WebKit's persistent website data store for that origin.
import Cocoa
import WebKit
import UserNotifications
import ServiceManagement

let appPort: UInt16 = 47615 // fixed, so saved progress (tied to the page's address) is always found again

// Where today stands, as the page reports it (js/app.js postStatus) after every save and page change.
struct StudyStatus {
    var streak = 0, freezes = 0, xpToday = 0, goal = 20, due = 0
    var nextId = "", nextTitle = "", wordId = "", wordFr = "", wordEn = ""
    var allDone = false, resume = false, reminder = true, menuBar = true
    var reminderHour = 19, reminderMinute = 0
    var theme = "auto"
    var studied: Bool { xpToday > 0 }

    init?(_ body: Any) {
        guard let d = body as? [String: Any] else { return nil }
        let int = { (k: String) in (d[k] as? NSNumber)?.intValue ?? 0 }
        let bool = { (k: String, def: Bool) in (d[k] as? Bool) ?? def }
        streak = int("streak"); freezes = int("freezes"); xpToday = int("xpToday"); due = int("due")
        goal = max(1, int("goal"))
        nextId = d["nextId"] as? String ?? ""; nextTitle = d["nextTitle"] as? String ?? ""
        if let w = d["word"] as? [String: Any] {
            wordId = w["id"] as? String ?? ""; wordFr = w["fr"] as? String ?? ""; wordEn = w["en"] as? String ?? ""
        }
        allDone = bool("allDone", false); resume = bool("resume", false)
        reminder = bool("reminder", true); menuBar = bool("menuBar", true)
        theme = d["theme"] as? String ?? "auto"
        let parts = (d["reminderTime"] as? String ?? "19:00").split(separator: ":").compactMap { Int($0) }
        if parts.count == 2, (0..<24).contains(parts[0]), (0..<60).contains(parts[1]) { reminderHour = parts[0]; reminderMinute = parts[1] }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate,
                         WKScriptMessageHandler, NSUserNotificationCenterDelegate {
    private var window: NSWindow!
    // Daily habit: menu bar item, reminders, Dock badge (all driven by the page's status messages).
    private var status: StudyStatus?
    private var statusItem: NSStatusItem?
    private var pageLoaded = false
    private var pendingHash: String?          // where to go once the page has loaded (opened from a reminder)
    private var notifications = "unknown"     // "granted" | "denied" | "unknown"
    private var reminderKey = ""              // what the scheduled reminders were built from
    private var lastNative = ""               // last report sent to the page
    private var launchedAtLogin = false
    private var ownReminders: [Timer] = []    // today's reminders shown by the app itself (see showReminderPanel)
    private var reminderPanel: NSPanel?
    private var keepInMenuBar: Bool {
        get { UserDefaults.standard.object(forKey: "menuBar") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "menuBar") }
    }
    private var web: WKWebView!
    private var server: LocalServer!
    private var crashTimes: [Date] = []
    private var downloadTargets: [ObjectIdentifier: (temp: URL, final: URL)] = [:]
    private var isHeadless: Bool { selfTest || snapshotArgs != nil }
    // Headless runs (self-test, snapshots) use their own port and a throwaway data store, so they never
    // collide with an open copy of the app or touch the progress saved in it.
    private var port: UInt16 { isHeadless ? appPort + 1 : appPort }
    private func isOurPage(_ url: URL?) -> Bool { url?.host == "127.0.0.1" && url?.port == Int(port) }
    private let selfTest = CommandLine.arguments.contains("--selftest")
    // --snapshot <file.png> [#/route] [--state <file.json>]: render the window to an image and quit (used to
    // check the layout and for the README screenshots). --state is a JSON object of localStorage entries
    // (key → string) to start from, e.g. demo progress; without it the page starts empty.
    private lazy var snapshotArgs: (path: String, route: String)? = {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count else { return nil }
        return (args[i + 1], i + 2 < args.count ? args[i + 2] : "#/")
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        if !isHeadless {
            // Started by macOS at login: stay in the menu bar instead of opening the window.
            let fourCC = { (s: String) in s.utf8.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) } }
            let event = NSAppleEventManager.shared().currentAppleEvent
            launchedAtLogin = event?.eventID == fourCC("oapp") && event?.paramDescriptor(forKeyword: fourCC("prdt"))?.enumCodeValue == fourCC("lgit")
            NSUserNotificationCenter.default.delegate = self
            // The day can change while the app sits in the menu bar: ask the page for a fresh status now and then.
            Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in self?.refreshStatus() }
            NotificationCenter.default.addObserver(forName: .NSCalendarDayChanged, object: nil, queue: .main) { [weak self] _ in self?.refreshStatus() }
            NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in self?.refreshStatus() }
        }
        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web")
        server = LocalServer(root: webRoot)
        server.start(port: port) { [weak self] error in
            guard let self else { return }
            if let error {
                self.fail("Coco · French couldn't start its local page server on port \(self.port).\n\n\(error.localizedDescription)\n\nIs another copy of the app already open?")
                return
            }
            self.openWindow()
        }
    }

    private func openWindow() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = isHeadless ? .nonPersistent() : .default() // persistent: progress survives restarts
        if let state = snapshotState {
            // Runs before the page's own scripts, so the app starts with this saved state.
            let js = "(() => { const s = \(state); for (const k in s) localStorage.setItem(k, s[k]); })();"
            config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController.add(self, name: "coco") // status messages from the page (ignored in headless runs)
        if !isHeadless {
            // The window draws a translucent sidebar behind the page (see below); css/mac.css leaves it uncovered.
            config.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('vibrant')",
                                                                    injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.mediaTypesRequiringUserActionForPlayback = [] // pronunciation plays automatically
        config.preferences.isElementFullscreenEnabled = true
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = true
        if #available(macOS 13.3, *) { web.isInspectable = true }

        // One surface from edge to edge: the page runs under a transparent, unified titlebar (the empty
        // toolbar gives it the taller desktop height, and stays draggable), next to a translucent sidebar.
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 840),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Coco · French"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        let toolbar = NSToolbar(identifier: "main")
        toolbar.showsBaselineSeparator = false
        window.toolbar = toolbar
        window.toolbarStyle = .unified
        window.minSize = NSSize(width: 960, height: 640)
        if isHeadless {
            window.contentView = web
        } else {
            let backdrop = NSVisualEffectView()
            backdrop.material = .sidebar
            backdrop.blendingMode = .behindWindow
            backdrop.state = .followsWindowActiveState
            web.setValue(false, forKey: "drawsBackground") // the sidebar material shows through where the page is transparent
            web.frame = backdrop.bounds
            web.autoresizingMask = [.width, .height]
            backdrop.addSubview(web)
            window.contentView = backdrop
        }
        window.isReleasedWhenClosed = false // closing only hides it while Coco stays in the menu bar
        window.delegate = self
        window.center()
        if !isHeadless { window.setFrameAutosaveName("CocoMainWindow") } // snapshots keep the default size
        let quietStart = launchedAtLogin && keepInMenuBar
        if !isHeadless && !quietStart { window.makeKeyAndOrderFront(nil) }
        if !quietStart { NSApp.activate(ignoringOtherApps: true) }
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/index.html\(snapshotArgs?.route ?? "")")!))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { isHeadless || !keepInMenuBar }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow() // Dock icon clicked while only the menu bar item is showing
        return true
    }

    func windowWillClose(_ notification: Notification) {
        guard (notification.object as? NSWindow) === window else { return } // not the reminder panel
        // Staying in the menu bar: stop audio and the microphone, and free the speech recognizer's memory.
        if !isHeadless && keepInMenuBar { js("window.CocoMac && CocoMac.hidden()") }
    }

    private func js(_ source: String) { if pageLoaded { web?.evaluateJavaScript(source, completionHandler: nil) } }
    private func jsString(_ s: String) -> String { // a Swift string as a JavaScript literal
        let data = (try? JSONSerialization.data(withJSONObject: [s])) ?? Data("[\"\"]".utf8)
        return String(String(decoding: data, as: UTF8.self).dropFirst().dropLast())
    }
    private func refreshStatus() { js("window.CocoMac && CocoMac.status()") }

    // Brings the window forward, optionally at a page ("#/today").
    private func showWindow(_ hash: String? = nil) {
        guard let window, !isHeadless else { return }
        let wasHidden = !window.isVisible
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard pageLoaded else { pendingHash = hash ?? pendingHash; return }
        if wasHidden { js("window.CocoMac && CocoMac.shown()") }
        if let hash { js("window.CocoMac && CocoMac.go(\(jsString(hash)))") }
    }

    // MARK: - Daily habit: status from the page → menu bar item, Dock badge, reminders

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard !isHeadless, isOurPage(message.frameInfo.request.url), let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "status":
            guard let s = StudyStatus(body) else { return }
            status = s
            keepInMenuBar = s.menuBar
            // Titlebar buttons and the sidebar material follow the app's own light / dark setting.
            window?.appearance = s.theme == "light" ? NSAppearance(named: .aqua) : s.theme == "dark" ? NSAppearance(named: .darkAqua) : nil
            updateStatusItem()
            NSApp.dockTile.badgeLabel = s.due > 0 ? "\(s.due)" : nil
            scheduleReminders()
        case "loginItem":
            let on = body["on"] as? Bool ?? false
            do { if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } }
            catch { showAlert("“Open at login” couldn't be changed.", detail: error.localizedDescription) }
            lastNative = ""
            reportNative()
        case "testReminder": sendTestReminder()
        case "openNotificationSettings":
            if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") { NSWorkspace.shared.open(url) }
        default: break
        }
    }

    // Tells the page what only the app knows, when it changes.
    private func reportNative() {
        let login = SMAppService.mainApp.status == .enabled
        let report = "{notifications: '\(notifications)', loginItem: \(login)}"
        if report == lastNative { return }
        lastNative = report
        js("window.CocoMac && CocoMac.native(\(report))")
    }

    private func updateStatusItem() {
        guard let s = status, s.menuBar, !isHeadless else {
            if let item = statusItem { NSStatusBar.system.removeStatusItem(item); statusItem = nil }
            return
        }
        if statusItem == nil { statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength) }
        guard let item = statusItem, let button = item.button else { return }
        // A filled flame once you've studied today, an outline until then; ✓ when the daily goal is reached.
        let image = NSImage(systemSymbolName: s.studied ? "flame.fill" : "flame", accessibilityDescription: "Streak")
        image?.isTemplate = true
        button.image = image
        button.imagePosition = .imageLeading
        button.title = s.xpToday >= s.goal ? "\(s.streak) ✓" : "\(s.streak)"
        let days = "\(s.streak)-day streak"
        button.toolTip = "Coco · French — \(days), \(s.xpToday)/\(s.goal) XP today" + (s.due > 0 ? ", \(s.due) to review" : "")

        let menu = NSMenu()
        let add = { (title: String, action: Selector?, hash: String?) -> NSMenuItem in
            let it = NSMenuItem(title: title, action: action, keyEquivalent: "")
            it.target = self
            it.representedObject = hash
            menu.addItem(it)
            return it
        }
        _ = add("Today: \(s.xpToday) / \(s.goal) XP" + (s.xpToday >= s.goal ? "  ✓ goal reached" : ""), nil, nil)
        var streakLine = "🔥 \(days)" + (s.freezes > 0 ? "  ·  ❄️ \(s.freezes) freeze\(s.freezes == 1 ? "" : "s")" : "")
        if !s.studied && s.streak > 0 { streakLine += "  —  study today to keep it" }
        _ = add(streakLine, nil, nil)
        menu.addItem(.separator())
        _ = add(s.resume ? "Continue Where You Left Off" : s.studied ? "Keep Going" : "Start Today's Session", #selector(openAt(_:)), "#/today")
        if s.due > 0 { _ = add("Review \(s.due) Word\(s.due == 1 ? "" : "s")", #selector(openAt(_:)), "#/review/start") }
        if !s.allDone && !s.nextId.isEmpty { _ = add("Next Lesson: \(s.nextTitle)", #selector(openAt(_:)), "#/unit/\(s.nextId)") }
        if !s.wordFr.isEmpty {
            menu.addItem(.separator())
            let word = add("Mot du jour :  \(s.wordFr)  —  \(s.wordEn)", #selector(playWord), nil)
            word.image = NSImage(systemSymbolName: "speaker.wave.2", accessibilityDescription: "Hear it")
            word.toolTip = "Click to hear it"
        }
        menu.addItem(.separator())
        _ = add("Open Coco · French", #selector(openAt(_:)), nil)
        menu.addItem(withTitle: "Quit Coco · French", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        item.menu = menu
    }

    @objc private func openAt(_ sender: NSMenuItem) { showWindow(sender.representedObject as? String) }
    @objc private func playWord() { if let id = status?.wordId { js("window.CocoMac && CocoMac.play(\(jsString(id)))") } }

    // MARK: - Reminders (local notifications, scheduled a week ahead so they arrive even when the app is closed)
    // These use NSUserNotificationCenter: macOS refuses the newer UserNotifications requests from an app
    // built and signed locally ("Notifications are not allowed for this application"), while this API
    // works and makes macOS ask for permission the first time a reminder is delivered.

    private func scheduleReminders() {
        guard !isHeadless, let s = status else { return }
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { return }
                // Only read here, to tell you when reminders are switched off in System Settings.
                switch settings.authorizationStatus {
                case .notDetermined: self.notifications = "unknown"
                case .denied: self.notifications = "denied"
                default: self.notifications = "granted"
                }
                self.reportNative()
                let cal = Calendar.current, now = Date()
                let key = "\(cal.startOfDay(for: now))|\(self.notifications)|\(s.reminder)|\(s.reminderHour):\(s.reminderMinute)|\(s.streak)|\(s.studied)|\(s.freezes)|\(s.due)|\(s.nextTitle)"
                if key == self.reminderKey { return }
                self.reminderKey = key
                let center = NSUserNotificationCenter.default
                center.scheduledNotifications.forEach { center.removeScheduledNotification($0) }
                self.ownReminders.forEach { $0.invalidate() }
                self.ownReminders = []
                guard s.reminder else { return }

                let schedule = { (id: String, dayOffset: Int, hour: Int, minute: Int, title: String, body: String) in
                    guard let day = cal.date(byAdding: .day, value: dayOffset, to: now),
                          let fire = cal.date(bySettingHour: hour, minute: minute, second: 0, of: day), fire > now else { return }
                    let note = self.reminder(id, title, body)
                    note.deliveryDate = fire
                    center.scheduleNotification(note)
                    // Until macOS notifications are known to be allowed, the app also shows today's reminders
                    // itself (it has to be running: in the menu bar, or with its window open).
                    if self.notifications != "granted" && dayOffset == 0 {
                        let timer = Timer(fire: fire, interval: 0, repeats: false) { [weak self] _ in self?.showReminderPanel(title, body, always: false) }
                        RunLoop.main.add(timer, forMode: .common)
                        self.ownReminders.append(timer)
                    }
                }
                let enough = "A few minutes is enough."
                let later = ["Un peu de français aujourd'hui ? \(enough)", "Coco t'attend ! Your words are ready for review.",
                             "C'est l'heure du français. One short session today?"]
                for d in 0..<7 {
                    if d == 0 {
                        if s.studied { continue } // already studied today: no nagging
                        let what = s.due > 0 ? "\(s.due) word\(s.due == 1 ? "" : "s") to review. " : s.nextTitle.isEmpty ? "" : "Next: \(s.nextTitle). "
                        let lead = s.streak > 0 ? "Your \(s.streak)-day streak is waiting. " : ""
                        schedule("daily-0", 0, s.reminderHour, s.reminderMinute, "C'est l'heure ! 🐓", "\(lead)\(what)\(enough)")
                    } else {
                        schedule("daily-\(d)", d, s.reminderHour, s.reminderMinute, "Bonjour ! 🐓", later[d % later.count])
                    }
                }
                // A last call at 21:30 on a day the streak would end (unless the reminder itself is that late).
                if s.reminderHour < 21 {
                    let title = s.freezes > 0 ? "🔥 Keep your \(s.streak)-day streak going" : "🔥 Your \(s.streak)-day streak ends at midnight"
                    let body = s.freezes > 0 ? "A streak freeze would cover today, but one quick review saves it for later." : "One quick review keeps it alive."
                    if !s.studied && s.streak > 0 { schedule("saver-0", 0, 21, 30, title, body) }
                    if s.studied && s.streak >= 2 { schedule("saver-1", 1, 21, 30, title, body) }
                }
            }
        }
    }

    private func reminder(_ id: String, _ title: String, _ body: String) -> NSUserNotification {
        let note = NSUserNotification()
        note.identifier = id
        note.title = title
        note.informativeText = body
        note.soundName = NSUserNotificationDefaultSoundName
        return note
    }

    private func sendTestReminder() {
        let note = reminder("test", "C'est l'heure ! 🐓", "This is what your daily reminder looks like. It takes you straight to today's session.")
        note.deliveryDate = Date().addingTimeInterval(3)
        NSUserNotificationCenter.default.scheduleNotification(note)
        if notifications != "granted" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                self?.showReminderPanel(note.title ?? "", note.informativeText ?? "", always: true)
            }
        }
        js("window.CocoMac && CocoMac.notify('🔔', 'Test reminder sent', 'It appears in a few seconds. The first time, macOS may ask you to allow notifications.')")
        // The permission may just have changed: look again shortly.
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in self?.reminderKey = ""; self?.scheduleReminders() }
    }

    // Coco's own reminder: a small floating window at the top right, used while macOS notifications are off.
    private func showReminderPanel(_ title: String, _ body: String, always: Bool) {
        if !always && (window?.isKeyWindow ?? false) { return } // already studying
        reminderPanel?.close()
        let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 360, height: 120),
                            styleMask: [.titled, .closable, .nonactivatingPanel, .utilityWindow], backing: .buffered, defer: false)
        panel.title = "Coco · French"
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let head = NSTextField(labelWithString: title)
        head.font = .boldSystemFont(ofSize: 14)
        let text = NSTextField(wrappingLabelWithString: body)
        text.textColor = .secondaryLabelColor
        text.preferredMaxLayoutWidth = 320
        let start = NSButton(title: "Start", target: self, action: #selector(reminderStart))
        start.keyEquivalent = "\r"
        let later = NSButton(title: "Later", target: self, action: #selector(reminderLater))
        let buttons = NSStackView(views: [NSView(), later, start])
        let stack = NSStackView(views: [head, text, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.edgeInsets = NSEdgeInsets(top: 14, left: 18, bottom: 14, right: 18)
        buttons.widthAnchor.constraint(equalToConstant: 324).isActive = true
        panel.contentView = stack
        panel.setContentSize(stack.fittingSize)
        if let area = NSScreen.main?.visibleFrame {
            panel.setFrameTopLeftPoint(NSPoint(x: area.maxX - panel.frame.width - 16, y: area.maxY - 16))
        }
        panel.orderFrontRegardless()
        NSSound(named: "Glass")?.play()
        reminderPanel = panel
    }
    @objc private func reminderStart() { reminderPanel?.close(); reminderPanel = nil; showWindow("#/today") }
    @objc private func reminderLater() { reminderPanel?.close(); reminderPanel = nil }

    func userNotificationCenter(_ center: NSUserNotificationCenter, shouldPresent notification: NSUserNotification) -> Bool {
        // Not while you're already in the app (except the test, which you asked to see).
        notification.identifier == "test" || !(window?.isKeyWindow ?? false)
    }

    func userNotificationCenter(_ center: NSUserNotificationCenter, didActivate notification: NSUserNotification) {
        center.removeDeliveredNotification(notification)
        showWindow("#/today") // a click on a reminder starts today's session
    }

    // MARK: - Page loaded (and the optional self-test)

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if !isHeadless {
            pageLoaded = true
            lastNative = "" // a fresh page knows nothing yet
            reportNative()
            if let hash = pendingHash { pendingHash = nil; js("window.CocoMac && CocoMac.go(\(jsString(hash)))") }
            // Started quietly at login: don't hold the speech recognizer in memory until the window opens.
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                if let self, !self.window.isVisible { self.js("window.CocoMac && CocoMac.hidden()") }
            }
            return
        }
        if let snap = snapshotArgs { return takeSnapshot(snap.path, route: snap.route) }
        guard selfTest else { return }
        // Checks the things that only work inside the real app: storage, WebGPU, and offline speech recognition.
        let js = """
        const out = { ok: true };
        out.storage = (() => { try { localStorage.setItem('selftest', '1'); return localStorage.getItem('selftest') === '1'; } catch (e) { return false; } })();
        out.webgpu = !!(navigator.gpu && await navigator.gpu.requestAdapter());
        out.mic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        out.units = window.FR_DATA ? FR_DATA.units.length : 0;
        try { // the microphone tap used for instant recording must load under the app's security policy
          const actx = new AudioContext(); await actx.audioWorklet.addModule('js/mic-worklet.js');
          new AudioWorkletNode(actx, 'mic-tap'); await actx.close(); out.micTap = true;
        } catch (e) { out.micTap = 'failed: ' + e.message; }
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

    // The JSON text of --state <file.json>, if given and valid.
    private lazy var snapshotState: String? = {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--state"), i + 1 < args.count,
              let data = FileManager.default.contents(atPath: args[i + 1]),
              (try? JSONSerialization.jsonObject(with: data)) is [String: String] else { return nil }
        return String(data: data, encoding: .utf8)
    }()

    private func takeSnapshot(_ path: String, route: String) {
        // The page was loaded at the route already; this only stops animations so it renders at rest.
        web.evaluateJavaScript("document.documentElement.classList.add('snapshot')")
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
        decisionHandler(origin.host == "127.0.0.1" && origin.port == Int(port) && type == .microphone ? .grant : .deny)
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
        showWindow() // the window may be closed while Coco sits in the menu bar
        web?.evaluateJavaScript("location.hash = '\(hash)'")
    }

    @objc private func reloadPage() { web?.reload() }

    private func fail(_ message: String) {
        if isHeadless { print(selfTest ? "SELFTEST failed:" : "SNAPSHOT failed:", message); exit(1) } // never an alert on screen
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
