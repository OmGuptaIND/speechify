import AppKit
import SwiftUI

// Colour tokens shared with extension/src/panel/styles.css.
extension Color {
  private static func dynamic(light: NSColor, dark: NSColor) -> Color {
    Color(
      nsColor: NSColor(name: nil) { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
      })
  }
  private static func hex(_ value: UInt32) -> NSColor {
    NSColor(
      srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255, alpha: 1)
  }
  static let paper = dynamic(light: hex(0xFFFFFF), dark: hex(0x252629))
  static let surface = dynamic(light: hex(0xFCFBF9), dark: hex(0x1D1E20))
  static let soft = dynamic(light: hex(0xF3F1EE), dark: hex(0x292A2E))
  static let border = dynamic(light: hex(0xEAE8E5), dark: hex(0x34353A))
  static let accent = dynamic(light: hex(0x6550C6), dark: hex(0xA99AEA))
  static let tint = dynamic(light: hex(0xF1EDFC), dark: hex(0x302B43))
  static let errorText = dynamic(light: hex(0x974A2E), dark: hex(0xF4B99D))
  static let errorBackground = dynamic(light: hex(0xFCEFE9), dark: hex(0x3B2925))
  // Kept for the tint modifier on the window.
  static let readerPurple = accent
}

func bytes(_ count: Int64) -> String {
  ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
}

func abbreviated(_ url: URL) -> String {
  (url.path as NSString).abbreviatingWithTildeInPath
}

struct StatusLabel: View {
  let text: String
  var active = false
  var body: some View {
    HStack(spacing: 7) {
      Circle().fill(active ? Color.green : Color.secondary.opacity(0.6)).frame(width: 7, height: 7)
      Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(
        active ? .primary : .secondary)
    }.accessibilityElement(children: .combine)
  }
}

struct CredentialRow: View {
  let label: String
  let value: String
  var masked = false
  var copyEnabled = true
  let copy: () -> Void
  var body: some View {
    HStack(spacing: 12) {
      Text(label).font(.system(size: 12)).foregroundStyle(.secondary).frame(
        width: 52, alignment: .leading)
      Text(masked ? String(repeating: "•", count: 18) : value)
        .font(.system(size: 12, design: .monospaced)).lineLimit(1).truncationMode(.middle)
        .textSelection(.enabled).foregroundStyle(masked ? .secondary : .primary)
      Spacer(minLength: 8)
      Button("Copy", action: copy).controlSize(.small).disabled(!copyEnabled)
    }
    .padding(.horizontal, 12).padding(.vertical, 8)
    .background(Color.soft, in: RoundedRectangle(cornerRadius: 8))
  }
}

struct ChecklistStep<Content: View>: View {
  let title: String
  let done: Bool
  @ViewBuilder var content: Content
  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: done ? "checkmark.circle.fill" : "circle")
        .font(.system(size: 16)).foregroundStyle(done ? Color.green : Color.secondary)
        .frame(width: 20).padding(.top, 1)
      VStack(alignment: .leading, spacing: 10) {
        Text(title).font(.system(size: 13, weight: done ? .regular : .semibold))
          .foregroundStyle(done ? .secondary : .primary)
        if !done { content }
      }.frame(maxWidth: .infinity, alignment: .leading)
    }.padding(.vertical, 4)
  }
}

struct Footnote: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View {
    Text(text).font(.system(size: 11)).foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
  }
}

struct InlineBar: View {
  enum Kind { case info, error }
  let text: String
  var kind: Kind = .info
  var actionTitle: String?
  var action: (() -> Void)?
  var body: some View {
    HStack(spacing: 12) {
      Text(text).font(.system(size: 12)).foregroundStyle(
        kind == .error ? Color.errorText : Color.primary)
      Spacer()
      if let actionTitle, let action {
        Button(actionTitle, action: action).controlSize(.small)
      }
    }
    .padding(.horizontal, 14).padding(.vertical, 8)
    .background(
      kind == .error ? Color.errorBackground : Color.soft, in: RoundedRectangle(cornerRadius: 8))
  }
}
