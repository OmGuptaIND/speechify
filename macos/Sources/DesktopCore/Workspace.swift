import Foundation

public struct Workspace: Sendable {
  public let root: URL
  public let data: URL
  public let standalone: Bool
  public init(root: URL) {
    self.root = root.standardizedFileURL
    self.data = self.root.appendingPathComponent(".data")
    self.standalone = false
  }
  public init(resources: URL, support: URL) {
    root = resources.standardizedFileURL
    data = support.standardizedFileURL
    standalone = true
  }
  public static var applicationSupport: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Speechify", isDirectory: true)
  }
  public var backend: URL { root.appendingPathComponent("backend") }
  public var models: URL { data.appendingPathComponent("models") }
  public var serviceExecutable: URL {
    root.deletingLastPathComponent().appendingPathComponent(
      "Helpers/Reader.app/Contents/MacOS/SpeechifyService")
  }
  public var bundledExtension: URL { root.appendingPathComponent("BrowserExtension") }
  public var extensionBuild: URL {
    standalone
      ? data.appendingPathComponent("BrowserExtension")
      : root.appendingPathComponent("extension/dist")
  }
  public var keyFile: URL { data.appendingPathComponent("backend.key") }
  public var valid: Bool {
    if standalone {
      return FileManager.default.isExecutableFile(atPath: serviceExecutable.path)
        && FileManager.default.fileExists(
          atPath: bundledExtension.appendingPathComponent("manifest.json").path)
    }
    return FileManager.default.fileExists(
      atPath: backend.appendingPathComponent("pyproject.toml").path)
      && FileManager.default.fileExists(
        atPath: root.appendingPathComponent("extension/package.json").path)
  }
  public var runtimeEnvironment: [String: String] {
    // Finder launches need no shell, developer tools, Python or Homebrew paths.
    var environment = ProcessInfo.processInfo.environment.filter { key, _ in
      !key.hasPrefix("PYTHON") && !key.hasPrefix("DYLD_") && !key.hasPrefix("UV_")
        && key != "VIRTUAL_ENV" && key != "PHONEMIZER_ESPEAK_LIBRARY" && key != "SSL_CERT_FILE"
    }
    environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin"
    environment["SPEECHIFY_DATA_DIR"] = data.path
    environment["PYTHONUNBUFFERED"] = "1"
    environment["PYTHONNOUSERSITE"] = "1"
    return environment
  }

  public func prepareDirectories() throws {
    try FileManager.default.createDirectory(
      at: data, withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700])
  }

  public func prepareExtension() throws {
    guard standalone else { return }
    let manager = FileManager.default
    for name in ["manifest.json", "background.js", "panel.js"] {
      guard manager.fileExists(atPath: bundledExtension.appendingPathComponent(name).path) else {
        throw DesktopError.message(
          "The app’s browser extension is incomplete. Reinstall Speechify from the installer.")
      }
    }
    let marker = "build-id.txt"
    if extensionReady,
      let current = try? Data(contentsOf: extensionBuild.appendingPathComponent(marker)),
      current == (try? Data(contentsOf: bundledExtension.appendingPathComponent(marker)))
    {
      return
    }
    try prepareDirectories()
    let pending = data.appendingPathComponent(".extension-" + UUID().uuidString)
    let backup = data.appendingPathComponent(".extension-backup-" + UUID().uuidString)
    defer {
      try? manager.removeItem(at: pending)
      try? manager.removeItem(at: backup)
    }
    try manager.copyItem(at: bundledExtension, to: pending)
    let existed = manager.fileExists(atPath: extensionBuild.path)
    if existed { try manager.moveItem(at: extensionBuild, to: backup) }
    do { try manager.moveItem(at: pending, to: extensionBuild) } catch {
      if existed { try? manager.moveItem(at: backup, to: extensionBuild) }
      throw error
    }
  }
  public var modelReady: Bool {
    ["kokoro-v1.0.int8.onnx", "voices-v1.0.bin"].allSatisfy {
      let url = models.appendingPathComponent($0)
      return ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) > 0
    }
  }
  public var extensionReady: Bool {
    ["manifest.json", "background.js", "panel.js"].allSatisfy {
      FileManager.default.fileExists(atPath: extensionBuild.appendingPathComponent($0).path)
    }
  }
  public func connectionKey() throws -> String {
    let value = try String(contentsOf: keyFile, encoding: .utf8).trimmingCharacters(
      in: .whitespacesAndNewlines)
    guard value.count >= 24 else {
      throw DesktopError.message("Start the local reader to create a connection key.")
    }
    return value
  }

  public static var toolEnvironment: [String: String] {
    var value = ProcessInfo.processInfo.environment
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    value["PATH"] =
      "\(home)/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:"
      + (value["PATH"] ?? "")
    value["PYTHONUNBUFFERED"] = "1"
    return value
  }
  public static func executable(_ name: String) -> URL? {
    for directory in (toolEnvironment["PATH"] ?? "").split(separator: ":") {
      let url = URL(fileURLWithPath: String(directory)).appendingPathComponent(name)
      if FileManager.default.isExecutableFile(atPath: url.path) { return url }
    }
    return nil
  }
}

public enum DesktopError: LocalizedError {
  case message(String)
  case busy
  public var errorDescription: String? {
    switch self {
    case .message(let text): text
    case .busy: "The reader is finishing another section. Pause other playback and try again."
    }
  }
}

public enum TextChunks {
  /// For each chunk, whether the source text had a line break in the gap before it.
  /// The first chunk is never a break. Chunks are located in order within `text`.
  public static func paragraphBreaks(in text: String, chunks: [String]) -> [Bool] {
    var result: [Bool] = []
    var cursor = text.startIndex
    for chunk in chunks {
      guard let range = text.range(of: chunk, range: cursor..<text.endIndex) else {
        result.append(false)
        continue
      }
      let gap = text[cursor..<range.lowerBound]
      result.append(!result.isEmpty && gap.contains { $0.isNewline })
      cursor = range.upperBound
    }
    return result
  }

  // Bound both Python's Unicode count and DOM/Swift UTF-16 offsets to 240.
  // Splitting on Character boundaries preserves emoji and composed characters.
  public static func split(_ text: String) -> [String] {
    var result: [String] = []
    var pending = text.trimmingCharacters(in: .whitespacesAndNewlines)
    while !pending.isEmpty {
      var end = pending.startIndex
      var breakAt: String.Index?
      var size = 0
      while end < pending.endIndex {
        let character = pending[end]
        let length = String(character).utf16.count
        if size + length > 240 { break }
        size += length
        end = pending.index(after: end)
        if character.isWhitespace { breakAt = end }
      }
      if end == pending.startIndex {
        // A single pathological grapheme may exceed the API limit.
        // Reject it rather than silently dropping or breaking source text.
        return []
      }
      if end < pending.endIndex, let boundary = breakAt { end = boundary }
      let part = String(pending[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
      if !part.isEmpty { result.append(part) }
      pending = String(pending[end...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return result
  }
}
