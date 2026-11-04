#!/usr/bin/env python3
"""
Optimized EGX report extractor using pypdfium2 for fast page detection
+ pdfplumber only on detected table pages.

This cuts extraction time from ~5 min to ~30-60 sec on the VPS.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

ENGINE_VERSION = f"pdfplumber-{getattr(pdfplumber, '__version__', 'unknown')}+pypdfium2-{getattr(pdfium, '__version__', 'unknown')}"

# Visual column order in the extracted table.
COLUMNS = [
    "exDate",
    "lastCoupon",
    "netProfitPeriodEnd",
    "netProfit",
    "dividendYield",
    "peTrailing",
    "paidCapital",
    "marketCap",
    "listedShares",
    "tradingVolume",
    "volumePct",
    "tradingValue",
    "changePct",
    "close",
    "currency",
    "rawName",
    "rank",
]

HEADER_MARKERS = ("P/E", "DY")

BIDI_AND_CONTROLS = re.compile("[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]")
TATWEEL = "\u0640"
ARABIC_DIACRITICS = re.compile("[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]")


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = BIDI_AND_CONTROLS.sub("", value)
    text = text.replace(TATWEEL, "")
    text = ARABIC_DIACRITICS.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


ARABIC_RANGES = (
    ("\u0600", "\u06ff"),
    ("\u0750", "\u077f"),
    ("\u08a0", "\u08ff"),
    ("\ufb50", "\ufdff"),
    ("\ufe70", "\ufeff"),
)


def _is_arabic(token: str) -> bool:
    return any(low <= char <= high for char in token for low, high in ARABIC_RANGES)


def _demirror_line(line: str) -> str:
    tokens = [token for token in line.split() if token]
    tokens.reverse()
    return " ".join(token[::-1] if _is_arabic(token) else token for token in tokens)


def arabic_logical_order(value: str | None) -> str:
    if not value:
        return ""
    text = BIDI_AND_CONTROLS.sub("", value)
    text = text.replace(TATWEEL, "")
    text = ARABIC_DIACRITICS.sub("", text)
    lines = [_demirror_line(line) for line in text.splitlines()]
    return unicodedata.normalize("NFKC", " ".join(line for line in lines if line)).strip()


CURRENCIES = {"EGP", "USD", "EUR", "SAR", "AED", "GBP"}


def parse_currency(value: str | None) -> str | None:
    text = clean_text(value).upper()
    if not text:
        return None
    if text in CURRENCIES:
        return text
    reversed_text = text[::-1]
    if reversed_text in CURRENCIES:
        return reversed_text
    return text


def parse_number(value: str | None) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    text = text.replace(",", "").replace("\u066b", ".").replace("\u066c", ",")
    text = text.replace("EGP", "").replace("USD", "").strip()
    negative = text.startswith("(") and text.endswith(")")
    if negative:
        text = text[1:-1]
    text = text.rstrip("%").strip()
    if not text or text in {"-", "—"}:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return -number if negative else number


def parse_date(value: str | None) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if not match:
        return None
    day, month, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def is_stock_table(table: list[list[str | None]]) -> bool:
    if not table or len(table[0]) < 15:
        return False
    header = " ".join(clean_text(cell) for cell in table[0])
    return all(marker in header for marker in HEADER_MARKERS)


def parse_page(page_no: int, table: list[list[str | None]], segment: str) -> list[dict]:
    rows: list[dict] = []
    for row_index, raw in enumerate(table[1:]):
        cells = list(raw) + [None] * (len(COLUMNS) - len(raw))
        record = dict(zip(COLUMNS, cells))

        rank = parse_number(record["rank"])
        name = arabic_logical_order(record["rawName"])
        if rank is None or not name:
            continue

        rows.append(
            {
                "rank": int(rank),
                "page": page_no,
                "rowIndex": row_index,
                "rawName": clean_text(record["rawName"]),
                "nameAr": name,
                "segment": segment,
                "currency": parse_currency(record["currency"]),
                "close": parse_number(record["close"]),
                "changePct": parse_number(record["changePct"]),
                "tradingValue": parse_number(record["tradingValue"]),
                "tradingVolume": parse_number(record["tradingVolume"]),
                "volumePct": parse_number(record["volumePct"]),
                "listedShares": parse_number(record["listedShares"]),
                "marketCap": parse_number(record["marketCap"]),
                "paidCapital": parse_number(record["paidCapital"]),
                "peTrailing": parse_number(record["peTrailing"]),
                "dividendYield": parse_number(record["dividendYield"]),
                "netProfit": parse_number(record["netProfit"]),
                "netProfitPeriodEnd": parse_date(record["netProfitPeriodEnd"]),
                "lastCoupon": parse_number(record["lastCoupon"]),
                "exDate": parse_date(record["exDate"]),
            }
        )
    return rows


def detect_table_pages(pdf_path: str) -> list[tuple[int, str]]:
    """
    Use pypdfium2 (fast) to find pages containing stock tables.
    Returns list of (page_no, segment).
    
    EGX reports have two table header variants:
    - SME tables (page 16): "P/E" + "DY"
    - Main tables (pages 17-23): "Trailing" + "DY%" / "صافي الربح"
    """
    table_pages: list[tuple[int, str]] = []
    doc = pdfium.PdfDocument(pdf_path)
    try:
        for i in range(len(doc)):
            page = doc[i]
            textpage = page.get_textpage()
            text = textpage.get_text_range()
            textpage.close()
            page.close()

            # Check for stock table markers (both header variants)
            # Variant 1: SME tables - "P/E" + "DY"
            # Variant 2: Main tables - "Trailing" + "DY%" / "صافي الربح"
            has_pe = (
                "P/E" in text or "ع/س" in text or
                "Trailing" in text
            )
            has_dy = (
                "DY" in text or "عائد" in text or
                "DY%" in text or "صافي الربح" in text
            )
            if has_pe and has_dy:
                # Determine segment from page text
                logical = arabic_logical_order(text)
                segment = "sme" if "الصغيرة والمتوسطة" in logical else "main"
                table_pages.append((i + 1, segment))
    finally:
        doc.close()
    return table_pages


def extract(pdf_path: str) -> dict:
    rows: list[dict] = []
    pages: list[dict] = []
    total_pages = 0

    # Fast page detection with pypdfium2
    table_pages = detect_table_pages(pdf_path)
    if not table_pages:
        print("extract_report: no stock table pages detected", file=sys.stderr)
        return {"engine": ENGINE_VERSION, "totalPages": total_pages, "pages": [], "rows": []}

    print(f"extract_report: detected {len(table_pages)} table page(s): {[p for p, _ in table_pages]}", file=sys.stderr)

    # Only process detected table pages with pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        for page_no, segment in table_pages:
            if page_no > total_pages:
                continue
            page = pdf.pages[page_no - 1]
            tables = page.extract_tables()
            if not tables:
                continue
            for table in tables:
                if not is_stock_table(table):
                    continue
                page_rows = parse_page(page_no, table, segment)
                if page_rows:
                    rows.extend(page_rows)
                    pages.append({"page": page_no, "segment": segment, "rows": len(page_rows)})
                break

    return {
        "engine": ENGINE_VERSION,
        "engineVersion": ENGINE_VERSION,
        "totalPages": total_pages,
        "pages": pages,
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="path to the report PDF")
    parser.add_argument("--out", help="write JSON here instead of stdout")
    args = parser.parse_args()

    try:
        artifact = extract(args.pdf)
    except Exception as error:  # noqa: BLE001
        print(f"extract_report: {type(error).__name__}: {error}", file=sys.stderr)
        return 1

    payload = json.dumps(artifact, ensure_ascii=False, indent=1)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(payload)
    else:
        print(payload)

    if not artifact["rows"]:
        print("extract_report: no stock rows found", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())