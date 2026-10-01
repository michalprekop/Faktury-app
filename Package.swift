// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "INVOY",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "INVOY", targets: ["INVOY"])],
    targets: [
        .systemLibrary(name: "CLZMA"),
        .target(name: "InvoiceCore", dependencies: ["CLZMA"]),
        .executableTarget(name: "INVOY", dependencies: ["InvoiceCore"], exclude: ["Resources"]),
        .testTarget(name: "InvoiceCoreTests", dependencies: ["InvoiceCore"]),
        .testTarget(name: "INVOYTests", dependencies: ["INVOY", "InvoiceCore"])
    ]
)
