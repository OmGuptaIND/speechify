import AVFoundation
import Foundation
import XCTest

@testable import DesktopCore

final class RealReaderTests: XCTestCase {
  @MainActor
  func testOwnedReaderStartsAndStopsWithoutAffectingTheExistingReader() async throws {
    guard ProcessInfo.processInfo.environment["SPEECHIFY_REAL_SMOKE"] == "1" else {
      throw XCTSkip("Opt in to the local uv process lifecycle check.")
    }
    let port = 18767
    guard (try? await ReaderAPI(port: port).health()) == nil else {
      throw XCTSkip("The isolated test port is already in use.")
    }
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent()
    guard let uv = Workspace.executable("uv") else {
      throw XCTSkip("uv is required for this local check.")
    }
    let data = root.appendingPathComponent(".data/native-lifecycle-" + UUID().uuidString)
    try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: data) }
    let process = Process()
    process.executableURL = uv
    process.arguments = [
      "run", "--project", root.appendingPathComponent("backend").path, "--locked", "--no-sync",
      "speechify-backend", "--quiet-key", "--port", String(port),
    ]
    process.environment = Workspace.toolEnvironment.merging(["SPEECHIFY_DATA_DIR": data.path]) {
      _, new in new
    }
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try process.run()
    defer { if process.isRunning { process.terminate() } }
    var ready = false
    for _ in 0..<50 {
      if (try? await ReaderAPI(port: port).health()) != nil {
        ready = true
        break
      }
      try await Task.sleep(for: .milliseconds(200))
    }
    XCTAssertTrue(ready)
    let key = try String(contentsOf: data.appendingPathComponent("backend.key"), encoding: .utf8)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    try await ReaderAPI(key: key, port: port).verifyKey()
    process.terminate()
    for _ in 0..<50 {
      let responding = (try? await ReaderAPI(port: port).health()) != nil
      if !process.isRunning && !responding { break }
      try await Task.sleep(for: .milliseconds(200))
    }
    XCTAssertFalse(process.isRunning)
    let stopped = (try? await ReaderAPI(port: port).health()) == nil
    XCTAssertTrue(stopped, "Stopping the owned uv process must also stop its backend.")
  }

  @MainActor
  func testRealBellaThroughDesktopAPI() async throws {
    guard ProcessInfo.processInfo.environment["SPEECHIFY_REAL_SMOKE"] == "1" else {
      throw XCTSkip("Opt in with SPEECHIFY_REAL_SMOKE=1; no model download is performed.")
    }
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent()
    let workspace = Workspace(root: root)
    guard workspace.modelReady, let uv = Workspace.executable("uv") else {
      throw XCTSkip("Install local models and uv before running the real smoke test.")
    }
    var owned: Process?
    if (try? await ReaderAPI().health()) == nil {
      let process = Process()
      process.executableURL = uv
      process.arguments = [
        "run", "--project", workspace.backend.path, "--locked", "--no-sync", "speechify-backend",
        "--quiet-key",
      ]
      process.environment = Workspace.toolEnvironment.merging([
        "SPEECHIFY_DATA_DIR": workspace.data.path
      ]) { _, new in new }
      process.currentDirectoryURL = root
      process.standardOutput = FileHandle.nullDevice
      process.standardError = FileHandle.nullDevice
      try process.run()
      owned = process
    }
    defer {
      if let process = owned, process.isRunning {
        process.terminate()
        process.waitUntilExit()
      }
    }
    var ready = false
    for _ in 0..<50 {
      if (try? await ReaderAPI().health()) != nil {
        ready = true
        break
      }
      try await Task.sleep(for: .milliseconds(200))
    }
    XCTAssertTrue(ready, "The Mac app must be able to start its reader without Terminal.")
    let api = ReaderAPI(key: try workspace.connectionKey())
    try await api.verifyKey()
    let text = "We reached 80 million dollars in 2026. Bella keeps your place."
    let speech = try await api.speak(text, voice: "af_bella")
    XCTAssertEqual(speech.alignment, "model-phonemes")
    XCTAssertGreaterThan(speech.duration, 0)
    XCTAssertFalse(speech.words.isEmpty)
    let audio = try XCTUnwrap(Data(base64Encoded: speech.audio))
    let player = try AVAudioPlayer(data: audio)
    XCTAssertEqual(player.duration, speech.duration, accuracy: 0.05)
    var end = 0.0
    for word in speech.words {
      XCTAssertGreaterThanOrEqual(word.start, end - 0.001)
      XCTAssertLessThanOrEqual(word.end, speech.duration + 0.001)
      XCTAssertGreaterThan(word.end_char, word.start_char)
      XCTAssertLessThanOrEqual(word.end_char, text.utf16.count)
      XCTAssertEqual(
        (text as NSString).substring(
          with: NSRange(location: word.start_char, length: word.end_char - word.start_char)),
        word.text)
      end = word.end
    }
  }
}
