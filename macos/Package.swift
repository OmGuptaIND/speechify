// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "SpeechifyDesktop",
  platforms: [.macOS(.v14)],
  products: [.executable(name: "SpeechifyDesktop", targets: ["SpeechifyDesktop"])],
  targets: [
    .target(name: "DesktopCore"),
    .executableTarget(name: "SpeechifyDesktop", dependencies: ["DesktopCore"]),
    .testTarget(name: "DesktopCoreTests", dependencies: ["DesktopCore"]),
  ]
)
