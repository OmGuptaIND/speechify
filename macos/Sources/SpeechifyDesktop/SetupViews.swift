import DesktopCore
import SwiftUI

/// First-run setup, rendered in the main window until it completes.
struct SetupView: View {
  @EnvironmentObject private var model: AppModel
  @EnvironmentObject private var playback: Playback
  @FocusState private var focused: Bool
  @State private var step = 0
  private let steps = ["Welcome", "Voices", "Chrome", "Done"]

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        ForEach(steps.indices, id: \.self) { index in
          Capsule().fill(index <= step ? Color.accent : Color.border).frame(height: 3)
        }
      }
      .padding(.horizontal, 40).padding(.top, 28)
      .accessibilityLabel("Step \(step + 1) of \(steps.count)")
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          switch step {
          case 0: welcome
          case 1: voices
          case 2: chrome
          default: done
          }
        }
        .frame(maxWidth: 480, alignment: .leading).padding(.horizontal, 40).padding(.vertical, 36)
        .frame(maxWidth: .infinity)
      }
      Divider()
      HStack {
        if step > 0 && step < 3 { Button("Back") { step -= 1 }.disabled(model.working) }
        Spacer()
        if step == 2 { Button("Skip for now") { step = 3 } }
        primaryButton
      }
      .controlSize(.large).padding(20)
    }
    .background(Color.surface)
    .onChange(of: model.online) { _, online in
      if step == 1 && online && model.modelsReady && model.extensionReady { step = 2 }
    }
  }

  private func heading(_ title: String, _ detail: String? = nil) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.system(size: 22, weight: .semibold))
      if let detail {
        Text(detail).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(
          horizontal: false, vertical: true)
      }
    }
  }

  private var welcome: some View {
    heading(
      "Speechify",
      "Reads text aloud with a voice that runs on this Mac. Nothing is sent to a server.")
  }

  private var voices: some View {
    Group {
      heading(
        "Download voices",
        "Bella, Heart and Nicole share one 142 MB download. Speech works offline afterwards.")
      VStack(alignment: .leading, spacing: 12) {
        ChecklistStep(title: "Reader runtime included", done: model.runtimeReady) { EmptyView() }
        ChecklistStep(title: "Voice files verified", done: model.modelsReady) { EmptyView() }
        ChecklistStep(title: "Chrome extension prepared", done: model.extensionReady) {
          EmptyView()
        }
        ChecklistStep(title: "Reader started", done: model.online) { EmptyView() }
      }
      .padding(16).background(Color.paper, in: RoundedRectangle(cornerRadius: 10))
      .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.border))
      if let operation = model.operation {
        HStack(spacing: 10) {
          ProgressView().controlSize(.small)
          VStack(alignment: .leading, spacing: 3) {
            Text(operation).font(.system(size: 12, weight: .medium))
            if !model.lastLogLine.isEmpty {
              Text(model.lastLogLine).font(.system(size: 11)).foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }
          Spacer()
          Button("Details") { model.showLog = true }.controlSize(.small)
        }
      }
    }
  }

  private var chrome: some View {
    Group {
      heading("Add to Chrome", "Chrome needs one manual step to load the local extension.")
      VStack(alignment: .leading, spacing: 14) { BrowserChecklist(includeReaderSteps: false) }
        .padding(16).background(Color.paper, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.border))
    }
  }

  private var done: some View {
    heading("Ready", "\(model.voiceName) is the default voice. Change it any time in Voices.")
  }

  @ViewBuilder private var primaryButton: some View {
    switch step {
    case 0:
      HStack {
        Button("Import previous setup…") { model.importPreviousSetup() }.disabled(model.working)
        Button("Continue") { step = 1 }.buttonStyle(.borderedProminent)
      }
    case 1:
      if model.modelsReady && model.extensionReady && model.runtimeReady {
        Button(model.online ? "Continue" : "Start reader") {
          if model.online {
            step = 2
          } else {
            Task { await model.startReader() }
          }
        }.buttonStyle(.borderedProminent).disabled(model.working)
      } else {
        Button(model.operation == nil ? "Download" : "Downloading…") {
          Task { await model.prepare() }
        }.buttonStyle(.borderedProminent).disabled(model.working)
      }
    case 2:
      Button("Continue") { step = 3 }.buttonStyle(.borderedProminent)
    default:
      Button("Start listening") { model.finishSetup() }.buttonStyle(.borderedProminent)
    }
  }
}
