import AppKit
import DesktopCore
import SwiftUI

struct BrowserView: View {
  @EnvironmentObject private var model: AppModel
  var body: some View {
    Form {
      Section {
        BrowserChecklist(includeReaderSteps: true)
      } footer: {
        Footnote(
          "Chrome reports in only while its reader panel is open; the status resets 75 seconds after it closes. After an app update, reload the extension in Chrome if asked."
        )
      }
    }
    .formStyle(.grouped).scrollContentBackground(.hidden)
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        StatusLabel(
          text: model.chromeConnected ? "Chrome connected" : "Chrome not connected",
          active: model.chromeConnected)
      }
    }
  }
}

/// Shared by the Browser page and first-run setup.
struct BrowserChecklist: View {
  @EnvironmentObject private var model: AppModel
  var includeReaderSteps: Bool
  var body: some View {
    if includeReaderSteps {
      ChecklistStep(title: "Reader running", done: model.online) {
        HStack(spacing: 10) {
          Button("Start") { Task { await model.startReader() } }
            .disabled(model.working || !model.modelsReady)
          if !model.modelsReady { Footnote("Download voices first.") }
        }
      }
      ChecklistStep(title: "Extension prepared", done: model.extensionReady) {
        Button("Prepare") { Task { await model.prepare() } }.disabled(model.working)
      }
    }
    ChecklistStep(title: "Add to Chrome", done: model.chromeConnected) {
      Text(
        "In Chrome, open the Extensions page, turn on Developer mode and choose Load unpacked. In the folder picker, press ⌘⇧G and paste this folder."
      )
      .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(
        horizontal: false, vertical: true)
      CredentialRow(
        label: "Folder", value: abbreviated(model.workspace.extensionBuild),
        copyEnabled: model.extensionReady
      ) { model.copyPath() }
      if model.chromeInstalled {
        Button("Open Chrome extensions") { model.openChrome() }
      } else {
        HStack(spacing: 6) {
          Footnote("Google Chrome is not installed.")
          Link("Get Chrome", destination: URL(string: "https://www.google.com/chrome/")!)
            .font(.system(size: 11))
        }
      }
    }
    ChecklistStep(title: "Connect", done: model.chromeConnected) {
      Text(
        "Open any article, click the Speechify icon in Chrome’s toolbar, paste this key and choose Connect reader."
      )
      .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(
        horizontal: false, vertical: true)
      CredentialRow(label: "Key", value: "", masked: true, copyEnabled: model.online) {
        model.copyKey()
      }
      if !model.online { Footnote("Start the reader to copy its key.") }
    }
  }
}
