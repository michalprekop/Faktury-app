// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Faktury",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Faktury", targets: ["Faktury"])],
    targets: [
        .systemLibrary(name: "CLZMA"),
        .target(name: "InvoiceCore", dependencies: ["CLZMA"]),
        .executableTarget(name: "Faktury", dependencies: ["InvoiceCore"], exclude: ["Resources"]),
        .testTarget(name: "InvoiceCoreTests", dependencies: ["InvoiceCore"]),
        .testTarget(name: "FakturyTests", dependencies: ["Faktury", "InvoiceCore"])
    ]
)
