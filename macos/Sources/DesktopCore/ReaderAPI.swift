import Foundation

public struct Health: Decodable, Sendable {
  public let status: String
  public let models_ready: Bool
  public let worker_loaded: Bool
  public let busy: Bool
}
public struct CompanionStatus: Decodable, Sendable {
  public let extension_connected: Bool
  public let last_seen_seconds: Int?
  public let extension_version: String?
}
public struct WordTiming: Decodable, Sendable {
  public let text: String
  public let start_char: Int
  public let end_char: Int
  public let start: Double
  public let end: Double
}
public struct Speech: Decodable, Sendable {
  public let audio: String
  public let duration: Double
  public let words: [WordTiming]
  public let alignment: String
}

public struct ReaderAPI: Sendable {
  public let key: String
  public let port: Int
  public init(key: String = "", port: Int = 8767) {
    self.key = key
    self.port = port
  }
  public func request(_ route: String, body: Data? = nil) async throws -> Data {
    var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)" + route)!)
    request.timeoutInterval = route == "/v1/speech" ? 120 : 3
    request.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
    if let body {
      request.httpMethod = "POST"
      request.httpBody = body
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw DesktopError.message("The local reader did not respond.")
    }
    if http.statusCode == 409 { throw DesktopError.busy }
    guard http.statusCode == 200 else {
      let detail =
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["detail"] as? String
      throw DesktopError.message(
        detail ?? "Local reader returned \(http.statusCode). Restart it from Home.")
    }
    return data
  }
  public func health() async throws -> Health {
    try await JSONDecoder().decode(Health.self, from: request("/v1/health"))
  }
  public func companion() async throws -> CompanionStatus {
    try await JSONDecoder().decode(CompanionStatus.self, from: request("/v1/companion"))
  }
  public func verifyKey() async throws { _ = try await request("/v1/voices") }
  public func speak(_ text: String, voice: String) async throws -> Speech {
    let body = try JSONSerialization.data(withJSONObject: ["text": text, "voice": voice])
    for attempt in 0..<30 {
      try Task.checkCancellation()
      do {
        let speech = try await JSONDecoder().decode(
          Speech.self, from: request("/v1/speech", body: body))
        guard speech.alignment == "model-phonemes" else {
          throw DesktopError.message("This model did not return synchronized word timings.")
        }
        var previousEnd = 0.0
        for word in speech.words {
          guard word.start >= previousEnd - 0.001, word.end >= word.start,
            word.end <= speech.duration + 0.001, word.start_char >= 0,
            word.end_char > word.start_char, word.end_char <= text.utf16.count
          else {
            throw DesktopError.message(
              "The reader returned invalid word timings. Try another passage.")
          }
          previousEnd = word.end
        }
        return speech
      } catch DesktopError.busy where attempt < 29 {
        try await Task.sleep(for: .milliseconds(300))
      }
    }
    throw DesktopError.busy
  }
}
