import AppKit
import SwiftUI

struct SpeechifyApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @StateObject private var model = AppModel()
  @StateObject private var playback = Playback()
  @StateObject private var preview = PreviewPlayer()

  var body: some Scene {
    WindowGroup("Speechify", id: "main") {
      ContentView()
        .environmentObject(model)
        .environmentObject(playback)
        .environmentObject(preview)
        .frame(minWidth: 860, minHeight: 600)
        .tint(.accent)
        .onAppear {
          playback.port = model.port
          playback.voice = model.preferences.voice
          playback.rate = model.preferences.rate
          delegate.model = model
          delegate.playback = playback
          if !delegate.started {
            delegate.started = true
            model.launch()
          }
        }
    }
    .defaultSize(width: 1040, height: 720)
    .commands {
      CommandGroup(replacing: .newItem) {}
      CommandMenu("Reader") {
        Button("Start") { Task { await model.startReader() } }
          .disabled(model.online || model.working)
        Button("Stop") {
          playback.stop()
          Task { await model.stopReader() }
        }
        .disabled(!model.ownsService || model.working)
        Button("Manage here") {
          playback.stop()
          Task { await model.manageExistingReader() }
        }
        .disabled(!model.online || model.ownsService || model.working)
        Divider()
        Button(playback.playing ? "Pause" : "Play") { model.togglePlayback(playback) }
          .keyboardShortcut(playback.hasSession ? KeyboardShortcut(.space, modifiers: []) : nil)
          .disabled(!model.online || (!playback.hasSession && playback.text.isEmpty))
        Button("Previous part") { playback.move(-1) }
          .keyboardShortcut(.leftArrow, modifiers: .command)
          .disabled(!playback.hasSession || playback.index == 0)
        Button("Next part") { playback.move(1) }
          .keyboardShortcut(.rightArrow, modifiers: .command)
          .disabled(!playback.hasSession || playback.index + 1 >= playback.chunks.count)
        Button("Stop playback") { playback.stop() }
          .keyboardShortcut(".", modifiers: .command)
          .disabled(!playback.hasSession)
        Divider()
        Button("Open log") {
          model.reveal(model.workspace.data.appendingPathComponent("desktop-service.log"))
        }
      }
      CommandGroup(after: .sidebar) {
        Divider()
        ForEach(Array(Destination.allCases.enumerated()), id: \.element) { index, destination in
          Button(destination.rawValue) { model.destination = destination }
            .keyboardShortcut(KeyEquivalent(Character(String(index + 1))), modifiers: .command)
            .disabled(model.showSetup)
        }
      }
      CommandGroup(replacing: .help) {
        Button("Browser Setup") {
          model.showSetup = false
          model.destination = .browser
        }
        Button("Set Up Again…") { model.showSetup = true }.disabled(model.working)
      }
    }
    Settings {
      SettingsView().environmentObject(model).environmentObject(playback)
    }
  }
}

@main
enum SpeechifyEntry {
  @MainActor
  static func main() async {
    if CommandLine.arguments.contains("--check-installation") {
      let model = AppModel()
      await model.checkInstallation()
    } else {
      SpeechifyApp.main()
    }
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  weak var model: AppModel?
  weak var playback: Playback?
  var started = false
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if model?.operation != nil || model?.maintenance == true {
      model?.fail("Setup is still running", "Wait for it to finish, then quit.")
      return .terminateCancel
    }
    playback?.stop()
    model?.shutdown()
    return .terminateNow
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
