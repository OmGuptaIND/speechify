import AVFoundation
import AppKit
import Combine
import Darwin
import DesktopCore
import Foundation

enum Destination: String, CaseIterable, Identifiable {
  case listen = "Listen"
  case voices = "Voices"
  case browser = "Browser"
  var id: String { rawValue }
  var icon: String {
    switch self {
    case .listen: "headphones"
    case .voices: "person.wave.2"
    case .browser: "globe"
    }
  }
}

struct Preferences: Codable {
  var onboardingComplete = false
  var autoStart = true
  var voice = "af_bella"
  var rate: Float = 1
  var trackedFolders: [String] = []
}

@MainActor
final class AppModel: ObservableObject {
  let workspace: Workspace
  let port: Int
  @Published var destination: Destination = .listen
  @Published var preferences = Preferences()
  @Published var showSetup = false
  @Published var showLog = false
  @Published var errorTitle = "Couldn’t continue"
  @Published var health: Health?
  @Published var companion: CompanionStatus?
  @Published var online = false
  @Published var starting = false
  @Published var operation: String?
  @Published var log = ""
  @Published var error: String?
  @Published var notice: String?
  @Published var inventories: [FolderInventory] = []
  @Published var scanning = false
  @Published var ownsService = false
  @Published private(set) var maintenance = false
  @Published var modelsReady = false
  @Published var extensionReady = false
  private var service: Process?
  private var pollTask: Task<Void, Never>?
  private var refreshing = false
  private var stopping = false

  init() {
    let support: URL
    if let index = CommandLine.arguments.firstIndex(of: "--support-dir"),
      CommandLine.arguments.count > index + 1
    {
      support = URL(fileURLWithPath: CommandLine.arguments[index + 1])
    } else {
      support = Workspace.applicationSupport
    }
    if let index = CommandLine.arguments.firstIndex(of: "--port"),
      CommandLine.arguments.count > index + 1,
      let selected = Int(CommandLine.arguments[index + 1]), (1024...65535).contains(selected)
    {
      port = selected
    } else {
      port = 8767
    }
    workspace = Workspace(
      resources: Bundle.main.resourceURL ?? Bundle.main.bundleURL, support: support)
    if let data = try? Data(contentsOf: workspace.data.appendingPathComponent("desktop.json")),
      let saved = try? JSONDecoder().decode(Preferences.self, from: data)
    {
      preferences = saved
    }
    if !Voice.all.contains(where: { $0.id == preferences.voice }) {
      preferences.voice = Voice.defaultID
    }
    preferences.rate = min(2.5, max(0.75, preferences.rate))
    showSetup = !preferences.onboardingComplete
    modelsReady = workspace.modelReady
    extensionReady = workspace.extensionReady
  }

  var modelBytes: Int64 { inventories.reduce(0) { $0 + $1.bytes } }
  var allocatedBytes: Int64 { inventories.reduce(0) { $0 + $1.allocated } }
  var fileCount: Int { inventories.reduce(0) { $0 + $1.files.count } }
  var runtimeReady: Bool {
    FileManager.default.isExecutableFile(atPath: workspace.serviceExecutable.path)
  }
  var working: Bool { operation != nil || starting || stopping || maintenance }
  var voiceName: String { Voice.named(preferences.voice) }
  var chromeConnected: Bool { companion?.extension_connected == true }
  var chromeInstalled: Bool {
    NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") != nil
  }
  var lastLogLine: String {
    log.split(whereSeparator: \.isNewline).last.map(String.init)?.trimmingCharacters(
      in: .whitespaces) ?? ""
  }
  var readerStatus: String {
    if starting { return "Starting…" }
    if stopping { return "Stopping…" }
    if !online { return "Stopped" }
    if !ownsService { return "Running outside this app" }
    if health?.busy == true { return "Preparing speech" }
    if health?.worker_loaded == true { return "Ready" }
    return "Ready, engine resting"
  }

  func fail(_ title: String, _ message: String) {
    errorTitle = title
    error = message
  }

  /// Play, pause or replay the Listen session with the saved voice and speed.
  func togglePlayback(_ playback: Playback) {
    if playback.playing {
      playback.pause()
      return
    }
    if playback.finished { playback.jump(to: 0); return }
    do {
      playback.rate = preferences.rate
      playback.play(key: try workspace.connectionKey(), voice: preferences.voice)
    } catch { fail("Couldn’t read the connection key", error.localizedDescription) }
  }

  func launch() {
    guard workspace.valid else {
      fail(
        "Runtime missing",
        "Reinstall Speechify from its installer. Voices and settings are kept.")
      return
    }
    Task {
      do {
        try workspace.prepareDirectories()
        try workspace.prepareExtension()
      } catch {
        self.error = error.localizedDescription
        return
      }
      await refresh()
      await scanModels()
      if preferences.autoStart && modelsReady && !online { await startReader() }
    }
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(4))
        guard !Task.isCancelled else { return }
        await self?.refresh()
      }
    }
  }

  func save() {
    do {
      try FileManager.default.createDirectory(at: workspace.data, withIntermediateDirectories: true)
      let data = try JSONEncoder().encode(preferences)
      let url = workspace.data.appendingPathComponent("desktop.json")
      try data.write(to: url, options: .atomic)
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    } catch { self.error = error.localizedDescription }
  }

  func finishSetup() {
    preferences.onboardingComplete = true
    save()
    showSetup = false
    destination = .listen
  }

  func refresh() async {
    guard !refreshing else { return }
    refreshing = true
    defer { refreshing = false }
    modelsReady = workspace.modelReady
    extensionReady = workspace.extensionReady
    do {
      let key = try workspace.connectionKey()
      let api = ReaderAPI(key: key, port: port)
      let status = try await api.health()
      try await api.verifyKey()
      health = status
      online = true
      companion = try? await api.companion()
    } catch {
      online = false
      health = nil
      companion = nil
    }
  }

  func scanModels() async {
    guard !scanning else { return }
    scanning = true
    let folders = ModelInventory.distinctFolders(
      [workspace.models] + preferences.trackedFolders.map { URL(fileURLWithPath: $0) })
    inventories = await Task.detached(priority: .utility) { folders.map(ModelInventory.scan) }.value
    scanning = false
  }

  func trackFolder() {
    let panel = NSOpenPanel()
    panel.title = "Track a voice model folder"
    panel.message =
      "Speechify measures model files here. This does not move files or enable a new speech engine."
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    if panel.runModal() == .OK, let folder = panel.url {
      preferences.trackedFolders.append(folder.resolvingSymlinksInPath().path)
      preferences.trackedFolders = Array(Set(preferences.trackedFolders)).sorted()
      save()
      Task { await scanModels() }
    }
  }

  func untrack(_ folder: URL) {
    preferences.trackedFolders.removeAll { $0 == folder.path }
    save()
    Task { await scanModels() }
  }

  func startReader(allowDuringSetup: Bool = false) async {
    guard !starting, !stopping, operation == nil, !maintenance || allowDuringSetup else { return }
    starting = true
    defer { starting = false }
    await refresh()
    if online { return }
    guard service?.isRunning != true else {
      fail(
        "Reader couldn’t start",
        "The reader is still starting or its connection key changed. Stop it, then start again.")
      return
    }
    guard workspace.modelReady else {
      fail("Reader couldn’t start", "Download the voice files from Voices first.")
      return
    }
    guard runtimeReady else {
      fail("Reader couldn’t start", "The included runtime is missing. Reinstall Speechify.")
      return
    }
    do {
      try FileManager.default.createDirectory(at: workspace.data, withIntermediateDirectories: true)
      let url = workspace.data.appendingPathComponent("desktop-service.log")
      FileManager.default.createFile(
        atPath: url.path, contents: Data(), attributes: [.posixPermissions: 0o600])
      let output = try FileHandle(forWritingTo: url)
      defer { try? output.close() }
      let process = Process()
      process.executableURL = workspace.serviceExecutable
      process.arguments = [
        "serve", "--quiet-key", "--port", String(port),
      ]
      process.currentDirectoryURL = workspace.data
      process.environment = workspace.runtimeEnvironment
      process.standardOutput = output
      process.standardError = output
      process.standardInput = FileHandle.nullDevice
      try process.run()
      service = process
      ownsService = true
      for _ in 0..<40 {
        try await Task.sleep(for: .milliseconds(250))
        await refresh()
        if online { return }
        if !process.isRunning { break }
      }
      process.terminateIfRunning()
      ownsService = false
      fail(
        "Reader couldn’t start",
        "If an older Speechify reader is running, use Import previous setup in Settings. The service log is under Settings › Advanced."
      )
    } catch { fail("Reader couldn’t start", error.localizedDescription) }
  }

  func stopReader() async {
    guard ownsService, !stopping else { return }
    stopping = true
    defer { stopping = false }
    let process = service
    process?.terminateIfRunning()
    // Uvicorn finishes any bounded inference already running before exiting.
    for _ in 0..<120 {
      if process?.isRunning != true { break }
      try? await Task.sleep(for: .milliseconds(250))
    }
    if process?.isRunning == true {
      fail("Reader is still busy", "It is finishing the current section. Try again in a moment.")
    } else {
      service = nil
      ownsService = false
    }
    await refresh()
  }

  func shutdown() {
    pollTask?.cancel()
    service?.terminateIfRunning()
  }

  func manageExistingReader() async {
    guard !working, online, !ownsService else { return }
    maintenance = true
    operation = "Moving reader controls into this app"
    log = ""
    defer {
      operation = nil
      maintenance = false
    }
    do {
      // The controller verifies this checkout's live lock before signalling
      // its backend. This only happens after an explicit Manage here click.
      try await run(
        workspace.serviceExecutable, ["control", "stop"],
        title: "Moving reader controls into this app")
      await refresh()
      guard !online else {
        throw DesktopError.message(
          "This reader was started elsewhere. Stop it there, then choose Manage here again.")
      }
      operation = nil
      await startReader(allowDuringSetup: true)
      if online && ownsService {
        notice = "Speechify now manages the reader."
      }
    } catch { fail("Couldn’t take over the reader", error.localizedDescription) }
  }

  func prepare() async {
    guard !working else { return }
    maintenance = true
    defer { maintenance = false }
    // Never replace model files while either an app-owned or external worker is using them.
    await refresh()
    if online && !ownsService {
      fail("Reader is running elsewhere", "Choose Manage here in the sidebar first.")
      return
    }
    if ownsService { await stopReader() }
    guard !ownsService else { return }
    guard runtimeReady else {
      fail("Runtime missing", "Reinstall Speechify to restore the included runtime. Data is kept.")
      return
    }
    operation = "Preparing this Mac"
    log = ""
    do {
      try workspace.prepareDirectories()
      try workspace.prepareExtension()
      try await run(workspace.serviceExecutable, ["download"], title: "Preparing your voice files")
      operation = nil
      await scanModels()
      await startReader(allowDuringSetup: true)
      notice = online ? "Voices downloaded and verified." : "Voices downloaded."
    } catch {
      fail("Download didn’t finish", error.localizedDescription)
      operation = nil
    }
    await refresh()
  }

  func verifyModels() async {
    guard !working else { return }
    maintenance = true
    defer { maintenance = false }
    await refresh()
    if online && !ownsService {
      fail("Reader is running elsewhere", "Choose Manage here in the sidebar first.")
      return
    }
    if ownsService { await stopReader() }
    guard !ownsService else { return }
    operation = "Verifying voice files"
    log = ""
    do {
      try await run(
        workspace.serviceExecutable, ["download"],
        title: "Verifying voice files")
      notice = "Voice files verified."
    } catch { fail("Verification didn’t finish", error.localizedDescription) }
    operation = nil
    await scanModels()
    await refresh()
  }

  func importPreviousSetup() {
    guard !working else { return }
    let panel = NSOpenPanel()
    panel.title = "Move your previous Speechify setup"
    panel.message =
      "Choose the previous Speechify folder, its .data folder, or its models folder. Verified voices and available preferences will be copied. Its running reader will stop so this app can take over. Your original files are kept."
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.showsHiddenFiles = true
    guard panel.runModal() == .OK, let source = panel.url else { return }
    Task {
      maintenance = true
      defer {
        operation = nil
        maintenance = false
      }
      if ownsService { await stopReader() }
      guard !ownsService else { return }
      log = ""
      do {
        try workspace.prepareDirectories()
        try workspace.prepareExtension()
        try await run(
          workspace.serviceExecutable, ["migrate", source.path], title: "Moving your existing setup"
        )
        if let data = try? Data(contentsOf: workspace.data.appendingPathComponent("desktop.json")),
          let saved = try? JSONDecoder().decode(Preferences.self, from: data)
        {
          preferences = saved
          if !Voice.all.contains(where: { $0.id == preferences.voice }) {
            preferences.voice = Voice.defaultID
          }
          preferences.rate = min(2.5, max(0.75, preferences.rate))
        }
        operation = nil
        await scanModels()
        await startReader(allowDuringSetup: true)
        notice = "Previous setup imported."
      } catch { fail("Import didn’t finish", error.localizedDescription) }
      await refresh()
    }
  }

  // Explicit packaging QA mode; never used during ordinary application launches.
  func checkInstallation() async {
    await prepare()
    var result: [String: Any] = [
      "standalone": workspace.standalone, "runtime_in_bundle": runtimeReady,
      "extension_ready": workspace.extensionReady, "models_ready": workspace.modelReady,
      "ready": false,
    ]
    do {
      guard online else { throw DesktopError.message(error ?? "The bundled reader did not start.") }
      let api = ReaderAPI(key: try workspace.connectionKey(), port: port)
      let speech = try await api.speak(
        "Bella reads 80 million words in 2026. This app stands on its own.", voice: "af_bella")
      guard let data = Data(base64Encoded: speech.audio) else {
        throw DesktopError.message("Invalid audio.")
      }
      let audio = try AVAudioPlayer(data: data)
      guard !speech.words.isEmpty, abs(audio.duration - speech.duration) < 0.05 else {
        throw DesktopError.message("Packaged audio or alignment did not validate.")
      }
      result["ready"] = true
      result["audio_seconds"] = speech.duration
      result["word_count"] = speech.words.count
    } catch { result["error"] = error.localizedDescription }
    await stopReader()
    result["child_stopped"] = !ownsService
    do {
      try workspace.prepareDirectories()
      let report = try JSONSerialization.data(
        withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
      try report.write(
        to: workspace.data.appendingPathComponent("installation-check.json"), options: .atomic)
    } catch {
      NSLog("Installation check could not save its result: %@", error.localizedDescription)
    }
  }

  private func run(_ executable: URL, _ arguments: [String], title: String) async throws {
    operation = title
    try workspace.prepareDirectories()
    let root = workspace.data
    let environment = workspace.runtimeEnvironment
    try await Task.detached(priority: .utility) { [weak self] in
      let process = Process()
      let pipe = Pipe()
      process.executableURL = executable
      process.arguments = arguments
      process.currentDirectoryURL = root
      process.environment = environment
      process.standardOutput = pipe
      process.standardError = pipe
      process.standardInput = FileHandle.nullDevice
      try process.run()
      while true {
        let data = pipe.fileHandleForReading.availableData
        if data.isEmpty { break }
        let text = String(decoding: data, as: UTF8.self)
        await self?.appendLog(text)
      }
      process.waitUntilExit()
      if process.terminationStatus != 0 {
        throw DesktopError.message("\(title) failed. Open Details for the log, then retry.")
      }
    }.value
  }

  private func appendLog(_ text: String) {
    // Setup commands never print the connection key; keep only a bounded tail.
    log = String((log + text).suffix(14000))
  }

  func copyKey() {
    do {
      let key = try workspace.connectionKey()
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(key, forType: .string)
      notice = "Connection key copied."
    } catch { fail("Couldn’t read the connection key", error.localizedDescription) }
  }

  func copyPath() {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(workspace.extensionBuild.path, forType: .string)
    notice = "Extension folder copied."
  }

  func openChrome() {
    guard
      let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome")
    else {
      fail("Chrome not found", "Install Google Chrome, then try again.")
      return
    }
    let config = NSWorkspace.OpenConfiguration()
    NSWorkspace.shared.open(
      [URL(string: "chrome://extensions/")!], withApplicationAt: chrome, configuration: config
    ) { _, error in
      if let error {
        Task { @MainActor in self.fail("Couldn’t open Chrome", error.localizedDescription) }
      }
    }
  }
  func reveal(_ url: URL) { NSWorkspace.shared.activateFileViewerSelecting([url]) }
}

extension Process {
  fileprivate func terminateIfRunning() {
    if isRunning { _ = Darwin.kill(processIdentifier, SIGTERM) }
  }
}
