"""Strict, one-off extraction of the supplied 2026 SuperFaktura PDF batch."""
import argparse
import base64
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path
import re
from pypdf import PdfReader


def require(pattern, text, flags=0):
    match = re.search(pattern, text, flags)
    if not match:
        raise ValueError(f"Missing required field: {pattern}")
    return match


def amount(value):
    return Decimal(value.replace(" ", "").replace("\xa0", "").replace(",", "."))


def money(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def optional(pattern, text):
    match = re.search(pattern, text)
    return match[1].strip() if match else ""


def company(block, supplier=False):
    lines = [line.strip() for line in block.strip().splitlines() if line.strip()]
    registration = lines.pop(1) if supplier else ""
    postal = require(r"^(\d{3}\s?\d{2})\s+(.+)$", lines[2])
    return dict(name=lines[0], street=lines[1], postalCode=postal[1], city=postal[2],
                country=lines[3], companyID=optional(r"IČO: (.+)", block),
                taxID=optional(r"DIČ: (.+)", block), vatID=optional(r"IČ DPH: (.+)", block),
                email="", phone="", website="", registration=registration,
                vatPayer=bool(optional(r"IČ DPH: (.+)", block)))


def extract(page, index):
    text = page.extract_text().replace("\xa0", " ")
    assert "Strana 1/1" in text, "Multi-page source needs explicit grouping"
    number = require(r"Faktúra (\d+)", text)[1]
    supplier = company(require(r"DODÁVATEĽ:\s*\n(.*?)\nFaktúra", text, re.S)[1], True)
    customer = company(require(r"ODBERATEĽ:\s*\n(.*?)\nDátum vystavenia:", text, re.S)[1])
    issuer = require(r"Vystavil: (.+)", text)[1].strip()
    footer = require(r"Vystavil: .+\n\s*(.*?)\n(.*?)\nPowered", text, re.S)
    supplier["email"] = footer[1].strip()
    supplier["website"] = footer[2].strip()
    supplier["vatPayer"] = False
    assert "Nie sme platiteľmi DPH." in text
    banks = []
    for bank in re.finditer(r"^([^\n]+)\nIBAN / SWIFT: ([A-Z0-9 ]+) / ([A-Z0-9]+)$", text, re.M):
        banks.append(dict(name=bank[1].strip(), iban=bank[2].replace(" ", ""), swift=bank[3]))
    selected_iban = require(r"\nIBAN\n([A-Z0-9 ]+)\nVariabilný symbol", text)[1].replace(" ", "")
    selected = [bank for bank in banks if bank["iban"] == selected_iban]
    assert len(selected) == 1, f"Cannot choose the payment-summary account: {number}"
    table = require(r"Názov a popis položky([^\n]*)\n(.*?)\nPoznámka:", text, re.S)
    header, content = table[1], table[2]
    has_quantity, has_unit = "Počet" in header, "Jednotka" in header
    price = r"(\d[\d ]*,\d{2}) €"
    suffix = (r"(\d+(?:,\d+)?)\s+" if has_quantity else "")
    suffix += (r"(\S+)\s+" if has_unit else "")
    row_pattern = re.compile(r"^(.*?)\s+" + suffix + price + r"\s+" + price + r"\s*$", re.S)
    items, pending = [], []
    for line in content.splitlines():
        pending.append(line)
        if not line.endswith("€"):
            continue
        match = row_pattern.fullmatch("\n".join(pending))
        assert match, f"Unrecognized table row in {number}: {pending}"
        values = list(match.groups())
        name = " ".join(values.pop(0).split())
        quantity = amount(values.pop(0)) if has_quantity else None
        unit = values.pop(0) if has_unit else ""
        unit_price, row_total = map(amount, values)
        if quantity is None:
            assert unit_price > 0
            quantity = row_total / unit_price
        assert money(quantity * unit_price) == row_total, f"Row sum mismatch: {number}"
        items.append(dict(name=name, detail="", quantity=str(quantity), unit=unit,
                          unitPrice=str(unit_price), discount="0", vatRate="0"))
        pending = []
    assert not pending and items, f"Unparsed items in {number}"
    discount = optional(r"Zľava (\d+(?:,\d+)?)%:", text)
    if discount:
        assert len(items) == 1, "Global multi-line discount requires allocation verification"
        items[0]["discount"] = str(amount(discount))
    total = amount(require(r"Celková suma: (.*?) €", text)[1])
    remaining = amount(require(r"Suma na úhradu\n(.*?) €", text)[1])
    paid_field = optional(r"Uhradené: (.*?) €", text)
    paid = amount(paid_field) if paid_field else Decimal(0)
    calculated = sum(money(Decimal(item["quantity"]) * Decimal(item["unitPrice"]) * (1 - Decimal(item["discount"]) / 100)) for item in items)
    assert calculated == total, f"Invoice total mismatch: {number}: {calculated} != {total}"
    assert money(total - paid) == remaining, f"Payment mismatch: {number}"
    note = require(r"Poznámka: (.*?)(?:Suma pred zľavou:|\nCelková suma:)", text, re.S)[1].strip()
    logos = [image for image in page.images if image.image.size == (400, 400)]
    stamps = [image for image in page.images if image.image.size == (400, 248)]
    assert len(logos) == 1 and len(stamps) == 1
    return dict(sourcePage=index + 1, number=number, supplier=supplier, customer=customer,
                issueDate=require(r"Dátum vystavenia: ([\d.]+)", text)[1],
                dueDate=require(r"Dátum splatnosti: ([\d.]+)", text)[1],
                deliveryDate=optional(r"Dátum dodania: ([\d.]+)", text),
                variableSymbol=require(r"Variabilný symbol: (\d+)", text)[1],
                paymentMethod=optional(r"Forma úhrady: (.+)", text),
                items=items, account=selected[0], currency="EUR", paid=str(paid),
                sourceTotal=str(total), sourceRemaining=str(remaining), note=note, issuedBy=issuer,
                logo=base64.b64encode(logos[0].data).decode(),
                signature=base64.b64encode(stamps[0].data).decode())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    reader = PdfReader(args.source)
    invoices = [extract(page, i) for i, page in enumerate(reader.pages)]
    assert len(set(invoice["number"] for invoice in invoices)) == len(invoices)
    result = dict(sourceSHA256=hashlib.sha256(args.source.read_bytes()).hexdigest(), invoices=invoices)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    for invoice in invoices:
        print(f'{invoice["number"]} | {invoice["customer"]["name"]} | {len(invoice["items"])} items | total={invoice["sourceTotal"]} | paid={invoice["paid"]} | {invoice["account"]["name"]}')
    print("TOTAL", len(invoices), "invoices;", sum(Decimal(i["sourceTotal"]) for i in invoices), "EUR; unpaid", sum(Decimal(i["sourceRemaining"]) for i in invoices), "EUR")


if __name__ == "__main__":
    main()
