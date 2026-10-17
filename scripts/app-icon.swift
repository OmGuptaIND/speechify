import AppKit

let output = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
let bounds = NSRect(x: 62, y: 62, width: 900, height: 900)
let path = NSBezierPath(roundedRect: bounds, xRadius: 205, yRadius: 205)
let gradient = NSGradient(
  starting: NSColor(srgbRed: 0.53, green: 0.43, blue: 0.88, alpha: 1),
  ending: NSColor(srgbRed: 0.31, green: 0.22, blue: 0.65, alpha: 1))!
gradient.draw(in: path, angle: -65)
NSColor.white.setFill()
let heights: [CGFloat] = [115, 245, 390, 520, 350, 205, 95]
for (index, height) in heights.enumerated() {
  NSBezierPath(
    roundedRect: NSRect(
      x: 237 + CGFloat(index) * 80, y: 512 - height / 2, width: 42, height: height),
    xRadius: 21, yRadius: 21
  ).fill()
}
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
