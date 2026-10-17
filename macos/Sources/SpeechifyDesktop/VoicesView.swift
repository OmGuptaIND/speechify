import DesktopCore
import SwiftUI

struct VoicesView: View {
  @EnvironmentObject private var model: AppModel
  @EnvironmentObject private var playback: Playback
  @EnvironmentObject private var preview: PreviewPlayer

  var body: some View {
    Form {
      Section {
        ForEach(Voice.all) { voice in voiceRow(voice) }
      } footer: {
        Footnote("Voices share one 142 MB Kokoro download. Changing voice adds no download.")
      }
      Section {
        HStack {
          Text("Measured size")
          Spacer()
          Text(bytes(model.modelBytes)).monospacedDigit().foregroundStyle(.secondary)
          if model.scanning { ProgressView().controlSize(.mini) }
        }
        ForEach(model.inventories) { inventory in folderRow(inventory) }
        HStack {
          Button("Add folder…") { model.trackFolder() }
          Button(model.modelsReady ? "Verify files" : "Download") {
            playback.stop()
            Task { await model.verifyModels() }
          }.disabled(model.working)
          Button("Show in Finder") { model.reveal(model.workspace.models) }
          Spacer()
          Button {
            Task { await model.scanModels() }
          } label: {
            Image(systemName: "arrow.clockwise")
          }
          .disabled(model.scanning).accessibilityLabel("Measure again")
        }.controlSize(.small)
      } header: {
        Text("Storage")
      } footer: {
        Footnote(
          "Sizes are measured from files. Added folders are read only; shared and cloned files may be counted once. Playback uses Kokoro."
        )
      }
    }
    .formStyle(.grouped).scrollContentBackground(.hidden)
    .onDisappear { preview.stop() }
    .onChange(of: preview.error) { _, error in
      if let error {
        model.fail("Preview didn’t play", error)
        preview.error = nil
      }
    }
  }

  private func voiceRow(_ voice: Voice) -> some View {
    let selected = model.preferences.voice == voice.id
    let previewing = preview.voice == voice.id
    return HStack(spacing: 12) {
      Button {
        model.preferences.voice = voice.id
        playback.voice = voice.id
        model.save()
      } label: {
        HStack(spacing: 12) {
          Image(systemName: selected ? "largecircle.fill.circle" : "circle")
            .font(.system(size: 16)).foregroundStyle(selected ? Color.accent : Color.secondary)
          Text(voice.name).font(.system(size: 13, weight: selected ? .semibold : .regular))
          if voice.id == Voice.defaultID {
            Text("Default").font(.system(size: 10, weight: .medium))
              .padding(.horizontal, 6).padding(.vertical, 2)
              .background(Color.tint, in: Capsule()).foregroundStyle(Color.accent)
          }
          Spacer()
        }.contentShape(Rectangle())
      }
      .buttonStyle(.plain).accessibilityLabel("\(voice.name)\(selected ? ", selected" : "")")
      Button {
        do {
          preview.toggle(voice, key: try model.workspace.connectionKey(), port: model.port)
        } catch { model.fail("Preview didn’t play", error.localizedDescription) }
      } label: {
        HStack(spacing: 5) {
          if previewing && preview.loading {
            ProgressView().controlSize(.mini)
          } else {
            Image(systemName: previewing ? "stop.fill" : "play.fill").font(.system(size: 10))
          }
          Text(previewing ? "Stop" : "Preview")
        }.frame(width: 74)
      }
      .controlSize(.small).disabled(!model.online)
      .accessibilityLabel(previewing ? "Stop preview of \(voice.name)" : "Preview \(voice.name)")
    }.padding(.vertical, 2)
  }

  private func folderRow(_ inventory: FolderInventory) -> some View {
    let own = inventory.folder == model.workspace.models
    return DisclosureGroup {
      if let warning = inventory.warning { Footnote(warning) }
      if inventory.files.isEmpty {
        Text("No model files found.").font(.system(size: 12)).foregroundStyle(.secondary)
      }
      ForEach(inventory.files.prefix(100)) { file in
        HStack(spacing: 10) {
          VStack(alignment: .leading, spacing: 2) {
            Text(file.name).font(.system(size: 12)).lineLimit(1).truncationMode(.middle)
            Text(file.detail).font(.system(size: 11)).foregroundStyle(.secondary)
          }
          Spacer()
          Text(bytes(file.bytes)).font(.system(size: 12)).monospacedDigit().foregroundStyle(
            .secondary)
          Button {
            model.reveal(file.url)
          } label: {
            Image(systemName: "arrow.up.forward.square")
          }.buttonStyle(.plain).foregroundStyle(.secondary).accessibilityLabel("Show \(file.name)")
        }.padding(.leading, 4)
      }
      if inventory.files.count > 100 {
        Footnote("Showing 100 of \(inventory.files.count) files. Totals include all of them.")
      }
      if !own {
        Button("Remove from list") { model.untrack(inventory.folder) }.controlSize(.small)
          .help("Files stay where they are.")
      }
    } label: {
      HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 2) {
          Text(own ? "Speechify downloads" : inventory.folder.lastPathComponent).font(
            .system(size: 13))
          Text(abbreviated(inventory.folder)).font(.system(size: 11)).foregroundStyle(.secondary)
            .lineLimit(1).truncationMode(.middle)
        }
        Spacer()
        Text("\(inventory.files.count) files").font(.system(size: 11)).foregroundStyle(.secondary)
        Text(bytes(inventory.bytes)).font(.system(size: 12)).monospacedDigit()
          .frame(width: 76, alignment: .trailing)
        if own {
          Text(model.modelsReady ? "Verified" : "Download needed").font(.system(size: 11))
            .foregroundStyle(model.modelsReady ? Color.green : Color.secondary)
            .frame(width: 104, alignment: .trailing)
        } else {
          Text("Read only").font(.system(size: 11)).foregroundStyle(.secondary)
            .frame(width: 104, alignment: .trailing)
        }
      }
    }
  }
}
