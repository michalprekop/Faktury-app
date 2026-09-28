import Foundation

public enum InvoiceTemplate: String, Codable, CaseIterable {
    case boringDefault01
    case mono01

    public var title: String {
        switch self {
        case .boringDefault01: return "Boring default 01"
        case .mono01: return "Mono 01"
        }
    }
}

extension Invoice {
    public func resolvedTemplate(default template: InvoiceTemplate) -> InvoiceTemplate {
        cloudStyle?.layout ?? templateOverride ?? template
    }
}

public struct CloudInvoiceStyle: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var config: Config
    public struct Config: Codable, Equatable {
        public var layout: String
        public var accent: String
        public var wordmark: String
        public var logo: String
        public var footer: String
    }
    public var layout: InvoiceTemplate { config.layout == "mono" ? .mono01 : .boringDefault01 }
    public var logoData: Data? { config.logo.split(separator: ",", maxSplits: 1).last.flatMap { Data(base64Encoded: String($0)) } }
}
