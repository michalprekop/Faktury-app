import AppKit
import InvoiceCore

enum ProfileImageUpload {
    static let maximumBytes = 500_000
    static let help = "PNG alebo JPEG · do 0,5 MB"

    static func validate(_ data: Data) throws {
        guard data.count <= maximumBytes else {
            throw DataError.invalid("Obrázok môže mať najviac 0,5 MB.")
        }
        let png = data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10])
        let jpeg = data.starts(with: [255, 216, 255])
        guard (png || jpeg), NSImage(data: data) != nil else {
            throw DataError.invalid("Vyberte platný PNG alebo JPEG.")
        }
    }
}
