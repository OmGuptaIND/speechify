import DesktopCore
import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var model: AppModel
  @EnvironmentObject private var playback: Playback
  var body: some View {
    Group {
      if model.showSetup {
        SetupView()
      } else {
        NavigationSplitView {
          Sidebar()
        } detail: {
          detail
        }
      }
    }
    .sheet(isPresented: $model.showLog) { LogSheet() }
    .alert(
      model.errorTitle,
      isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })
    ) {
      Button("OK") { model.error = nil }
    } message: {
      Text(model.error ?? "")
    }
    .onChange(of: model.online) { _, online in if !online && playback.hasSession { playback.stop() }
    }
    .onChange(of: model.notice) { _, notice in
      guard notice != nil else { return }
      Task {
        try? await Task.sleep(for: .seconds(4))
        if model.notice == notice { withAnimation(.easeOut(duration: 0.2)) { model.notice = nil } }
      }
    }
  }

  private var detail: some View {
    Group {
      switch model.destination {
      case .listen: ListenView()
      case .voices: VoicesView()
      case .browser: BrowserView()
      }
    }
    .navigationTitle(model.destination.rawValue)
    .background(Color.surface)
    .overlay(alignment: .bottom) {
      if let notice = model.notice {
        Text(notice).font(.system(size: 12, weight: .medium))
          .padding(.horizontal, 14).padding(.vertical, 8)
          .background(.regularMaterial, in: Capsule())
          .overlay(Capsule().stroke(Color.border))
          .padding(.bottom, model.destination == .listen ? 72 : 20)
          .transition(.opacity)
          .accessibilityAddTraits(.isStaticText)
      }
    }
  }
}

struct Sidebar: View {
  @EnvironmentObject private var model: AppModel
  @EnvironmentObject private var playback: Playback
  var body: some View {
    List(selection: $model.destination) {
      ForEach(Destination.allCases) { destination in
        Label(destination.rawValue, systemImage: destination.icon).tag(destination)
      }
    }
    .listStyle(.sidebar)
    .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 260)
    .safeAreaInset(edge: .bottom, spacing: 0) { footer }
  }

  private var footer: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let operation = model.operation {
        HStack(spacing: 8) {
          ProgressView().controlSize(.small)
          Text(operation).font(.system(size: 12, weight: .medium)).lineLimit(1)
        }
        if !model.lastLogLine.isEmpty {
          Text(model.lastLogLine).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2)
        }
        Button("Details") { model.showLog = true }.controlSize(.small)
      } else {
        StatusLabel(text: model.readerStatus, active: model.online)
        HStack(spacing: 6) {
          if model.online && !model.ownsService {
            Button("Manage here") {
              playback.stop()
              Task { await model.manageExistingReader() }
            }
          } else if model.online {
            Button("Stop") {
              playback.stop()
              Task { await model.stopReader() }
            }
          } else {
            Button("Start") { Task { await model.startReader() } }.disabled(!model.modelsReady)
          }
          Menu {
            Button("Open log") {
              model.reveal(model.workspace.data.appendingPathComponent("desktop-service.log"))
            }
            Button("Show app data") { model.reveal(model.workspace.data) }
            Divider()
            SettingsLink { Text("Settings…") }
          } label: {
            Image(systemName: "ellipsis.circle")
          }
          .menuIndicator(.hidden).fixedSize().accessibilityLabel("More reader actions")
        }
        .controlSize(.small).disabled(model.working)
      }
    }
    .padding(.horizontal, 16).padding(.vertical, 14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .overlay(alignment: .top) { Divider() }
  }
}

struct LogSheet: View {
  @EnvironmentObject private var model: AppModel
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(model.operation ?? "Setup log").font(.system(size: 15, weight: .semibold))
      ScrollView {
        Text(model.log.isEmpty ? "Nothing logged yet." : model.log)
          .font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading).padding(10)
      }
      .background(Color.paper, in: RoundedRectangle(cornerRadius: 8))
      .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border))
      HStack {
        Spacer()
        Button("Done") { model.showLog = false }.keyboardShortcut(.defaultAction)
      }
    }
    .padding(20).frame(width: 560, height: 420)
  }
}
