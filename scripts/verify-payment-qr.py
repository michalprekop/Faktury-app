"""Independently decode QR strings scanned from the exported PDFs (stdlib only)."""
import base64
import json
import lzma
import sys
import zlib
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote

records = json.loads(Path(sys.argv[1]).read_text())
for record in records:
    payload = record["payload"]
    if payload.startswith("SPD*1.0*"):
        fields = dict(part.split(":", 1) for part in payload[8:].split("*") if part)
        actual = {
            "iban": fields["ACC"].split("+")[0],
            "beneficiary": unquote(fields["RN"]),
            "amount": fields["AM"],
            "currency": fields["CC"],
            "vs": fields.get("X-VS", ""),
        }
        assert "ALT-ACC" not in fields
    else:
        packet = base64.b32hexdecode(payload + "=" * (-len(payload) % 8))
        assert packet[:2] == bytes(2)
        size = int.from_bytes(packet[2:4], "little")
        decoder = lzma.LZMADecompressor(
            format=lzma.FORMAT_RAW,
            filters=[dict(id=lzma.FILTER_LZMA1, dict_size=131072, lc=3, lp=0, pb=2)],
        )
        content = decoder.decompress(packet[4:])
        assert len(content) == size
        assert int.from_bytes(content[:4], "little") == zlib.crc32(content[4:])
        fields = content[4:].decode("utf-8").split("\t")
        assert len(fields) == 19 and fields[1:3] == ["1", "1"]
        assert fields[11] == "1" and fields[14:16] == ["0", "0"]
        actual = dict(zip(["amount", "currency", "vs", "iban", "bic", "beneficiary"], [fields[3], fields[4], fields[6], fields[12], fields[13], fields[16]]))
    for key, value in actual.items():
        if key == "amount":
            assert Decimal(value) == Decimal(record[key]), (record["number"], key)
        else:
            assert value == record[key], (record["number"], key)
    print(f"PASS {record['number']}: account, beneficiary, amount, currency and VS")
print(f"Independently verified {len(records)} scanned payment QR codes.")
