import Foundation
import XCTest

@testable import DesktopCore

final class DesktopCoreTests: XCTestCase {
  func testBundledAssetsRemainIndependentOfAppLocation() throws {
    let manager = FileManager.default
    let temporary = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? manager.removeItem(at: temporary) }
    let app = temporary.appendingPathComponent("Install/Speechify.app")
    let resources = app.appendingPathComponent("Contents/Resources")
    let support = temporary.appendingPathComponent("User Support")
    let install = Workspace(resources: resources, support: support)
    try manager.createDirectory(at: install.bundledExtension, withIntermediateDirectories: true)
    for name in ["manifest.json", "background.js", "panel.js", "build-id.txt"] {
      try Data("original".utf8).write(to: install.bundledExtension.appendingPathComponent(name))
    }
    try manager.createDirectory(
      at: install.serviceExecutable.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("bundled executable".utf8).write(to: install.serviceExecutable)
    try manager.setAttributes(
      [.posixPermissions: 0o755], ofItemAtPath: install.serviceExecutable.path)
    XCTAssertTrue(install.valid)
    try install.prepareExtension()
    XCTAssertTrue(install.extensionReady)
    XCTAssertEqual(install.extensionBuild.deletingLastPathComponent().path, support.path)
    let relocated = temporary.appendingPathComponent("Moved App.app")
    try manager.moveItem(at: app, to: relocated)
    let moved = Workspace(
      resources: relocated.appendingPathComponent("Contents/Resources"), support: support)
    XCTAssertTrue(moved.valid)
    try Data("updated".utf8).write(
      to: moved.bundledExtension.appendingPathComponent("build-id.txt"))
    try Data("new script".utf8).write(to: moved.bundledExtension.appendingPathComponent("panel.js"))
    try moved.prepareExtension()
    XCTAssertEqual(
      try String(
        contentsOf: moved.extensionBuild.appendingPathComponent("panel.js"), encoding: .utf8),
      "new script")
    XCTAssertTrue(moved.runtimeEnvironment["PATH"]?.contains("homebrew") == false)
    XCTAssertEqual(moved.runtimeEnvironment["SPEECHIFY_DATA_DIR"], support.path)
  }

  func testChunksPreserveWordsAndRespectBothLimits() {
    let words = Array(repeating: "Hello 👋🏽 café 2026.", count: 80).joined(separator: " ")
    let chunks = TextChunks.split(words)
    XCTAssertGreaterThan(chunks.count, 1)
    XCTAssertTrue(chunks.allSatisfy { $0.utf16.count <= 240 && $0.unicodeScalars.count <= 240 })
    XCTAssertEqual(chunks.joined(separator: " "), words)
    XCTAssertEqual(TextChunks.split("   \n"), [])
  }
  func testInventorySkipsSymlinksAndPartialDownloads() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try Data(repeating: 1, count: 123).write(to: root.appendingPathComponent("engine.onnx"))
    try Data(repeating: 1, count: 456).write(to: root.appendingPathComponent("voices.bin.part"))
    try FileManager.default.createSymbolicLink(
      atPath: root.appendingPathComponent("alias.onnx").path,
      withDestinationPath: root.appendingPathComponent("engine.onnx").path)
    let inventory = ModelInventory.scan(root)
    XCTAssertEqual(inventory.files.count, 1)
    XCTAssertEqual(inventory.bytes, 123)
    XCTAssertEqual(
      ModelInventory.distinctFolders([root, root.appendingPathComponent("nested"), root]).count, 1)
  }

  func testParagraphBreaksFollowSourceLineBreaks() {
    let first = String(repeating: "alpha ", count: 30)
    let second = String(repeating: "beta ", count: 30)
    let text = first.trimmingCharacters(in: .whitespaces) + "\n\n" + second + "gamma delta"
    let chunks = TextChunks.split(text)
    XCTAssertGreaterThan(chunks.count, 2)
    let breaks = TextChunks.paragraphBreaks(in: text, chunks: chunks)
    XCTAssertEqual(breaks.count, chunks.count)
    XCTAssertFalse(breaks[0])
    XCTAssertEqual(breaks.filter { $0 }.count, 1)
    XCTAssertTrue(breaks[1])
    XCTAssertEqual(TextChunks.paragraphBreaks(in: "", chunks: []), [])
  }
}
