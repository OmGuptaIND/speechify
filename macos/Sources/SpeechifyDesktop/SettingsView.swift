import DesktopCore
import SwiftUI

struct SettingsView: View {
  var body: some View {
    TabView {
      GeneralSettings().tabItem { Label("General", systemImage: "gear") }
      StorageSettings().tabItem { Label("Storage", systemImage: "internaldrive") }
      AdvancedSettings().tabItem { Label("Advanced", systemImage: "wrench.and.screwdriver") }
    }
    .frame(width: 520)
  }
}

struct GeneralSettings: View {
  @EnvironmentObject private var model: AppModel
  @EnvironmentObject private var playback: Playback
  var body: some View {
    Form {
      Section {
        Toggle("Start the reader when Speechify opens", isOn: $model.preferences.autoStart)
          .onChange(of: model.preferences.autoStart) { _, _ in model.save() }
      } footer: {
        Footnote("The reader stops when Speechify quits. No login item is installed.")
      }
      Section {
        Picker("Voice", selection: $model.preferences.voice) {
          ForEach(Voice.all) { voice in Text(voice.name).tag(voice.id) }
        }
        .onChange(of: model.preferences.voice) { _, voice in
          playback.voice = voice
          model.save()
        }
        LabeledContent("Speed") {
          HStack {
            Slider(value: $model.preferences.rate, in: 0.75...2.5, step: 0.05)
            Text(String(format: "%.2f×", model.preferences.rate)).monospacedDigit()
              .foregroundStyle(.secondary).frame(width: 48, alignment: .trailing)
          }
        }
        .onChange(of: model.preferences.rate) { _, rate in
          playback.rate = rate
          model.save()
        }
      }
    }
    .formStyle(.grouped)
  }
}

struct StorageSettings: View {
  @EnvironmentObject private var model: AppModel
  var body: some View {
    Form {
      Section {
        LabeledContent("Data folder") {
          HStack {
            Text(abbreviated(model.workspace.data)).font(.system(size: 12, design: .monospaced))
              .lineLimit(1).truncationMode(.middle).textSelection(.enabled)
            Button("Show in Finder") { model.reveal(model.workspace.data) }.controlSize(.small)
          }
        }
        LabeledContent("Voice files", value: bytes(model.modelBytes))
      } footer: {
        Footnote("Removing the app keeps this folder for a later reinstall.")
      }
      Section {
        Button("Import previous setup…") { model.importPreviousSetup() }.disabled(model.working)
      } footer: {
        Footnote(
          "Copies verified voices and preferences from an older Speechify project folder. Original files are kept."
        )
      }
    }
    .formStyle(.grouped)
  }
}

struct AdvancedSettings: View {
  @EnvironmentObject private var model: AppModel
  var body: some View {
    Form {
      Section {
        LabeledContent(
          "Reader runtime", value: model.runtimeReady ? "Included in the app" : "Missing")
        LabeledContent("Browser extension", value: model.extensionReady ? "Prepared" : "Not prepared")
        LabeledContent("Port", value: String(model.port))
      }
      Section {
        HStack {
          Button("Repair installation") { Task { await model.prepare() } }.disabled(model.working)
          Button("Open service log") {
            model.reveal(model.workspace.data.appendingPathComponent("desktop-service.log"))
          }
        }
      } footer: {
        Footnote("Repair re-publishes the extension and re-verifies the voice download.")
      }
      Section {
        DisclosureGroup("Resource limits") {
          LabeledContent("Inference workers", value: "1")
          LabeledContent("Inference threads", value: "2, CPU only")
          LabeledContent("Engine unloads", value: "After 3 idle minutes")
          LabeledContent("Speech request", value: "Up to 240 characters")
          LabeledContent("Desktop audio", value: "One part in memory, no prefetch")
          LabeledContent("Browser audio", value: "Six cached parts, one ahead")
        }
      }
    }
    .formStyle(.grouped)
  }
}
