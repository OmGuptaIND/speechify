import AppKit
import DesktopCore
import SwiftUI

struct ListenView: View {
  @EnvironmentObject private var model: AppModel
  @EnvironmentObject private var playback: Playback
  @FocusState private var editing: Bool
  @State private var showSpeed = false

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        surface
          .frame(maxWidth: 720)
          .padding(.horizontal, 28).padding(.vertical, 24)
          .frame(maxWidth: .infinity)
      }
      .onChange(of: playback.index) { _, index in
        withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(index, anchor: .center) }
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) { transport }
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        Picker("Voice", selection: $model.preferences.voice) {
          ForEach(Voice.all) { voice in Text(voice.name).tag(voice.id) }
        }
        .pickerStyle(.menu).fixedSize().help("Voice")
        .onChange(of: model.preferences.voice) { _, voice in
          playback.voice = voice
          model.save()
        }
        Button(speedLabel) { showSpeed.toggle() }
          .monospacedDigit().help("Speed")
          .popover(isPresented: $showSpeed, arrowEdge: .bottom) { speedPopover }
      }
    }
  }

  // MARK: Reading surface

  @ViewBuilder private var surface: some View {
    Group {
      if playback.hasSession {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(playback.chunks.indices, id: \.self) { index in
            Text(attributed(index))
              .font(.system(size: 19, design: .serif)).lineSpacing(11)
              .foregroundStyle(
                index == playback.index || playback.finished ? Color.primary : Color.secondary
              )
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 10).padding(.vertical, 6)
              .background(
                index == playback.index && !playback.finished ? Color.tint : Color.clear,
                in: RoundedRectangle(cornerRadius: 8)
              )
              .padding(.top, index > 0 && playback.paragraphBreaks[safe: index] == true ? 14 : 0)
              .contentShape(Rectangle())
              .onTapGesture { playback.jump(to: index) }
              .id(index)
              .accessibilityAddTraits(.isButton)
              .accessibilityHint("Reads from this part")
          }
        }
        .textSelection(.enabled)
        .padding(22)
      } else {
        TextEditor(text: $playback.text)
          .font(.system(size: 19, design: .serif)).lineSpacing(11)
          .scrollContentBackground(.hidden).scrollDisabled(true)
          .focused($editing)
          .frame(minHeight: 360, alignment: .topLeading)
          .padding(26)
          .accessibilityLabel("Text to read")
          .overlay(alignment: .topLeading) {
            if playback.text.isEmpty {
              VStack(alignment: .leading, spacing: 10) {
                Text("Paste or type something to listen to.")
                  .font(.system(size: 19, design: .serif)).foregroundStyle(.tertiary)
                Text("⌘V to paste. For a webpage, use the Chrome extension.")
                  .font(.system(size: 12)).foregroundStyle(.tertiary)
              }
              .padding(.top, 32).padding(.leading, 31).allowsHitTesting(false)
            }
          }
          .overlay(alignment: .bottomTrailing) {
            if playback.text.count > 45000 {
              Text("\(playback.text.count) / 50,000")
                .font(.system(size: 11)).monospacedDigit()
                .foregroundStyle(playback.text.count > 50000 ? Color.errorText : Color.secondary)
                .padding(12)
            }
          }
      }
    }
    .background(Color.paper, in: RoundedRectangle(cornerRadius: 14))
    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.border))
  }

  private func attributed(_ index: Int) -> AttributedString {
    let source = playback.chunks[index]
    var value = AttributedString(source)
    guard index == playback.index, let range = playback.wordRange, range.length > 0,
      let swiftRange = Range(range, in: source),
      let start = AttributedString.Index(swiftRange.lowerBound, within: value),
      let end = AttributedString.Index(swiftRange.upperBound, within: value)
    else { return value }
    value[start..<end].backgroundColor = Color.accent.opacity(0.22)
    return value
  }

  // MARK: Transport

  private var transport: some View {
    VStack(spacing: 0) {
      if let error = playback.error {
        InlineBar(text: error, kind: .error, actionTitle: "Retry") {
          model.togglePlayback(playback)
        }
        .padding(.horizontal, 28).padding(.top, 10)
      } else if !model.online && !model.working {
        InlineBar(text: "Reader is stopped.", actionTitle: "Start") {
          Task { await model.startReader() }
        }
        .padding(.horizontal, 28).padding(.top, 10)
      }
      HStack(spacing: 18) {
        HStack(spacing: 14) {
          transportButton("backward.end.fill", label: "Previous part") { playback.move(-1) }
            .disabled(!playback.hasSession || playback.index == 0 || playback.phase == "preparing")
          Button {
            model.togglePlayback(playback)
          } label: {
            ZStack {
              if playback.phase == "preparing" {
                ProgressView().controlSize(.small)
              } else {
                Image(systemName: playIcon).font(.system(size: 20, weight: .medium))
              }
            }.frame(width: 36, height: 36)
          }
          .buttonStyle(.plain).foregroundStyle(canPlay ? Color.accent : Color.secondary)
          .disabled(!canPlay).accessibilityLabel(playback.playing ? "Pause" : "Play")
          transportButton("forward.end.fill", label: "Next part") { playback.move(1) }
            .disabled(
              !playback.hasSession || playback.index + 1 >= playback.chunks.count
                || playback.phase == "preparing")
        }
        Slider(
          value: Binding(get: { playback.elapsed }, set: { playback.seek($0) }),
          in: 0...max(playback.duration, 0.01)
        ) { editing in
          playback.scrubbing = editing
        }
        .disabled(playback.duration == 0).accessibilityLabel("Position in this part")
        Text("\(clock(playback.elapsed)) / \(clock(playback.duration))")
          .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
          .frame(width: 78, alignment: .trailing)
        Text(playback.hasSession ? "Part \(playback.index + 1) of \(playback.chunks.count)" : "")
          .font(.system(size: 11)).monospacedDigit().foregroundStyle(.secondary)
          .frame(width: 92, alignment: .trailing)
      }
      .padding(.horizontal, 28).frame(height: 56)
    }
    .background(.bar)
    .overlay(alignment: .top) { Divider() }
  }

  private func transportButton(_ symbol: String, label: String, action: @escaping () -> Void)
    -> some View
  {
    Button(action: action) {
      Image(systemName: symbol).font(.system(size: 15, weight: .medium)).frame(
        width: 28, height: 28)
    }.buttonStyle(.plain).foregroundStyle(.primary).accessibilityLabel(label)
  }

  private var playIcon: String {
    if playback.playing { return "pause.fill" }
    if playback.finished { return "arrow.counterclockwise" }
    return "play.fill"
  }
  private var canPlay: Bool {
    model.online && (playback.hasSession || !playback.text.isEmpty)
  }
  private func clock(_ seconds: Double) -> String {
    let total = Int(seconds.rounded(.down))
    return String(format: "%d:%02d", total / 60, total % 60)
  }

  // MARK: Speed

  private var speedLabel: String { String(format: "%.1f×", model.preferences.rate) }

  private var speedPopover: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Speed").font(.system(size: 12, weight: .medium))
        Spacer()
        Text(String(format: "%.2f×", model.preferences.rate)).monospacedDigit()
          .font(.system(size: 12)).foregroundStyle(.secondary)
      }
      Slider(value: $model.preferences.rate, in: 0.75...2.5, step: 0.05)
        .accessibilityLabel("Playback speed")
      HStack(spacing: 6) {
        ForEach([0.8, 1.0, 1.2, 1.5, 2.0], id: \.self) { preset in
          Button(String(format: "%g×", preset)) { model.preferences.rate = Float(preset) }
            .controlSize(.small).monospacedDigit()
            .buttonStyle(.bordered)
            .tint(abs(model.preferences.rate - Float(preset)) < 0.01 ? Color.accent : nil)
        }
      }
    }
    .padding(16).frame(width: 260)
    .onChange(of: model.preferences.rate) { _, rate in
      playback.rate = rate
      model.save()
    }
  }
}

extension Array {
  fileprivate subscript(safe index: Int) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}
