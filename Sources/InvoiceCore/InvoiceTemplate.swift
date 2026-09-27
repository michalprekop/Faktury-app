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
        templateOverride ?? template
    }
}
