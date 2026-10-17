import Foundation

public struct ModelFile: Identifiable, Sendable {
  public var id: String { url.path }
  public let url: URL
  public let bytes: Int64
  public let allocated: Int64
  public var name: String { url.lastPathComponent }
  public var detail: String {
    switch name {
    case "kokoro-v1.0.int8.onnx": "Kokoro v1.0 · quantized speech engine"
    case "voices-v1.0.bin": "Shared voice pack · Bella, Heart, Nicole and upstream voices"
    default: "Tracked file · not enabled for playback"
    }
  }
}

public struct FolderInventory: Identifiable, Sendable {
  public var id: String { folder.path }
  public let folder: URL
  public let files: [ModelFile]
  public let warning: String?
  public var bytes: Int64 { files.reduce(0) { $0 + $1.bytes } }
  public var allocated: Int64 { files.reduce(0) { $0 + $1.allocated } }
}

public enum ModelInventory {
  public static func scan(_ folder: URL) -> FolderInventory {
    let manager = FileManager.default
    let keys: Set<URLResourceKey> = [
      .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey,
      .totalFileAllocatedSizeKey, .fileAllocatedSizeKey, .isDirectoryKey,
    ]
    guard
      let enumerator = manager.enumerator(
        at: folder, includingPropertiesForKeys: Array(keys),
        options: [.skipsHiddenFiles, .skipsPackageDescendants])
    else {
      return FolderInventory(
        folder: folder, files: [], warning: "Folder is missing or cannot be read.")
    }
    var files: [ModelFile] = []
    let types: Set<String> = [
      "onnx", "bin", "safetensors", "gguf", "pt", "pth", "npz", "tflite", "ckpt",
    ]
    var count = 0
    var warning: String?
    while let url = enumerator.nextObject() as? URL {
      count += 1
      if count > 20000 {
        warning = "Scan limited to 20,000 entries. Track a more specific folder."
        break
      }
      guard let values = try? url.resourceValues(forKeys: keys) else { continue }
      if values.isSymbolicLink == true {
        enumerator.skipDescendants()
        continue
      }
      if values.isDirectory == true {
        if url.pathComponents.count - folder.pathComponents.count >= 6 {
          warning =
            "Deeply nested folders were skipped. Track a more specific folder for complete totals."
          enumerator.skipDescendants()
        }
        continue
      }
      guard values.isRegularFile == true, types.contains(url.pathExtension.lowercased()) else {
        continue
      }
      files.append(
        ModelFile(
          url: url, bytes: Int64(values.fileSize ?? 0),
          allocated: Int64(
            values.totalFileAllocatedSize ?? values.fileAllocatedSize ?? values.fileSize ?? 0)))
    }
    return FolderInventory(
      folder: folder, files: files.sorted { $0.name < $1.name }, warning: warning)
  }

  public static func distinctFolders(_ folders: [URL]) -> [URL] {
    // Prevent nested tracked folders from counting the same files twice.
    var result: [URL] = []
    for url in folders.map({ $0.resolvingSymlinksInPath().standardizedFileURL }).sorted(by: {
      $0.path.count < $1.path.count
    }) {
      if !result.contains(where: { url.path == $0.path || url.path.hasPrefix($0.path + "/") }) {
        result.append(url)
      }
    }
    return result
  }
}
