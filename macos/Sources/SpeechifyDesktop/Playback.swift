import AVFoundation
import Combine
import DesktopCore
import Foundation

struct Voice: Identifiable, Hashable {
  let id: String
  let name: String
  static let all = [
    Voice(id: "af_bella", name: "Bella"),
    Voice(id: "af_heart", name: "Heart"),
    Voice(id: "af_nicole", name: "Nicole"),
  ]
  static let defaultID = "af_bella"
  static func named(_ id: String) -> String { all.first { $0.id == id }?.name ?? "Bella" }
}

@MainActor
final class Playback: NSObject, ObservableObject, AVAudioPlayerDelegate {
  @Published var text = ""
  @Published var phase = "idle"
  @Published var chunks: [String] = []
  /// True when the source text had a line break before this chunk.
  @Published var paragraphBreaks: [Bool] = []
  @Published var index = 0
  @Published var wordRange: NSRange?
  @Published var elapsed: Double = 0
  @Published var duration: Double = 0
  @Published var error: String?
  @Published var scrubbing = false
  private var player: AVAudioPlayer?
  private var speech: Speech?
  private var task: Task<Void, Never>?
  private var ticker: Task<Void, Never>?
  private var generation = 0
  private var key = ""
  var voice = Voice.defaultID
  var port = 8767
  var rate: Float = 1 { didSet { player?.rate = rate } }
  var hasSession: Bool { !chunks.isEmpty }
  var currentText: String { chunks.indices.contains(index) ? chunks[index] : "" }
  var playing: Bool { phase == "playing" || phase == "preparing" }
  var finished: Bool { phase == "finished" }

  func play(key: String, voice: String) {
    error = nil
    self.key = key
    self.voice = voice
    if phase == "paused", let player {
      player.play()
      phase = "playing"
      tick()
      return
    }
    if chunks.isEmpty {
      guard text.count <= 50000 else {
        error = "Text is limited to 50,000 characters."
        return
      }
      chunks = TextChunks.split(text)
      paragraphBreaks = TextChunks.paragraphBreaks(in: text, chunks: chunks)
      index = 0
    }
    guard !chunks.isEmpty else {
      error = "Add some readable text first."
      return
    }
    prepare()
  }

  func pause() {
    generation += 1
    task?.cancel()
    player?.pause()
    ticker?.cancel()
    phase = "paused"
  }

  func stop() {
    generation += 1
    task?.cancel()
    ticker?.cancel()
    player?.stop()
    player = nil
    speech = nil
    chunks = []
    paragraphBreaks = []
    index = 0
    wordRange = nil
    elapsed = 0
    duration = 0
    error = nil
    phase = "idle"
  }

  func move(_ delta: Int) { jump(to: index + delta) }

  func jump(to target: Int) {
    guard !chunks.isEmpty else { return }
    generation += 1
    task?.cancel()
    ticker?.cancel()
    player?.stop()
    player = nil
    index = min(chunks.count - 1, max(0, target))
    prepare()
  }

  func seek(_ time: Double) {
    guard let player, duration > 0 else { return }
    player.currentTime = min(max(0, time), max(0, duration - 0.05))
    elapsed = player.currentTime
    updateWord(at: player.currentTime)
  }

  private func prepare() {
    generation += 1
    let token = generation
    let text = currentText
    phase = "preparing"
    wordRange = nil
    elapsed = 0
    duration = 0
    speech = nil
    task = Task {
      do {
        let result = try await ReaderAPI(key: key, port: port).speak(text, voice: voice)
        try Task.checkCancellation()
        guard token == generation else { return }
        guard let data = Data(base64Encoded: result.audio) else {
          throw DesktopError.message("The reader returned invalid audio.")
        }
        let audio = try AVAudioPlayer(data: data)
        audio.enableRate = true
        audio.rate = rate
        audio.delegate = self
        speech = result
        player = audio
        duration = result.duration
        guard audio.play() else {
          throw DesktopError.message("Audio output is unavailable. Check Sound settings.")
        }
        phase = "playing"
        tick()
      } catch is CancellationError {
        // A paused/stopped passage must never start playing after its request finishes.
      } catch {
        guard token == generation else { return }
        self.error = error.localizedDescription
        phase = "paused"
      }
    }
  }

  private func updateWord(at time: Double) {
    let word = speech?.words.first { $0.start <= time && time < $0.end }
    wordRange = word.map { NSRange(location: $0.start_char, length: $0.end_char - $0.start_char) }
  }

  private func tick() {
    ticker?.cancel()
    ticker = Task { [weak self] in
      while !Task.isCancelled {
        guard let self, let player = self.player, self.phase == "playing" else { return }
        if !self.scrubbing {
          self.elapsed = player.currentTime
          self.updateWord(at: player.currentTime)
        }
        try? await Task.sleep(for: .milliseconds(35))
      }
    }
  }

  nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    let identity = ObjectIdentifier(player)
    Task { @MainActor [weak self] in
      guard let self, self.phase == "playing", self.player.map(ObjectIdentifier.init) == identity
      else { return }
      self.ticker?.cancel()
      self.player = nil
      if !flag {
        self.error = "Audio playback stopped unexpectedly."
        self.phase = "paused"
        return
      }
      if self.index + 1 < self.chunks.count {
        self.index += 1
        self.prepare()
      } else {
        self.phase = "finished"
        self.wordRange = nil
        self.elapsed = self.duration
      }
    }
  }
}

/// Plays short voice samples without touching the Listen session.
@MainActor
final class PreviewPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {
  @Published var voice: String?
  @Published var loading = false
  @Published var error: String?
  private var player: AVAudioPlayer?
  private var task: Task<Void, Never>?

  func toggle(_ voice: Voice, key: String, port: Int) {
    if self.voice == voice.id {
      stop()
      return
    }
    stop()
    self.voice = voice.id
    loading = true
    task = Task {
      do {
        let result = try await ReaderAPI(key: key, port: port).speak(
          "This is \(voice.name), reading a short sample.", voice: voice.id)
        try Task.checkCancellation()
        guard self.voice == voice.id, let data = Data(base64Encoded: result.audio) else { return }
        let audio = try AVAudioPlayer(data: data)
        audio.delegate = self
        player = audio
        loading = false
        if !audio.play() { throw DesktopError.message("Audio output is unavailable.") }
      } catch is CancellationError {
      } catch {
        self.error = error.localizedDescription
        self.voice = nil
        loading = false
      }
    }
  }

  func stop() {
    task?.cancel()
    player?.stop()
    player = nil
    voice = nil
    loading = false
  }

  nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    Task { @MainActor [weak self] in
      self?.player = nil
      self?.voice = nil
    }
  }
}
