"""Snapshot the office Soil Log Template into the generator's template snapshot.

Usage: python tools/snapshot_soil_log.py <source.xls> <converted.xlsx> <out_dir>

The .xls is the office original (hashed for provenance); the .xlsx is an Excel
"Save As" copy of it (see tools/snapshot-soil-log.ps1) that openpyxl can read.
Input cells (value cells beside header labels, the horizon rows, and every
yellow-filled cell) are cleared, so sample job data never enters the snapshot.
"""
import hashlib
import json
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import openpyxl
from openpyxl.utils import get_column_letter

HEADER_LABELS = {
    "PROJECT #:": "projectNumber",
    "PROJECT NAME:": "projectName",
    "LOCATION:": "location",
    "EVAL. BY:": "evalBy",
    "DATE:": "date",
    "TEST PIT#:": "testPitLabel",
    "CONFIRMATION NUMBER": "confirmationNumber",
}
HORIZON_COLUMNS = {
    "HORIZON": "designation",
    "DEPTH": "depth",
    "COLOR": "color",
    "TEXTURE": "texture",
    "STRUCTURE": "structure",
    "ROOTS": "roots",
    "MOTTLING": "mottling",
    "NOTES": "notes",
}
AREA_LABELS = {"PHOTO OF TEST PIT": "photo", "LOCATION OF TEST PIT WITHIN PROPERTY": "location"}


def label(v):
    """Label text compared without case, surrounding space or a trailing colon."""
    return v.strip().rstrip(":").strip().upper() if isinstance(v, str) else None


LABELS = {label(k): v for k, v in HEADER_LABELS.items()}
HORIZON_COLUMNS = {label(k): v for k, v in HORIZON_COLUMNS.items()}
AREA_LABELS = {label(k): v for k, v in AREA_LABELS.items()}


def style_of(c):
    s = {
        "font": {"name": c.font.name, "size": c.font.sz, "bold": bool(c.font.b)},
        "numFmt": c.number_format,
    }
    a = c.alignment
    al = {k: v for k, v in (("horizontal", a.horizontal), ("vertical", a.vertical)) if v}
    if a.wrap_text:
        al["wrapText"] = True
    if al:
        s["alignment"] = al
    b = c.border
    br = {k: getattr(b, k).style for k in ("left", "right", "top", "bottom") if getattr(b, k).style}
    if br:
        s["border"] = br
    if c.fill is not None and c.fill.fill_type == "solid":
        s["fill"] = c.fill.fgColor.rgb
    return s


def main(src_xls, src_xlsx, out_dir):
    raw = open(src_xls, "rb").read()
    wb = openpyxl.load_workbook(src_xlsx)
    ws = wb.worksheets[0]

    # The 2026-10-02 template stacks two pit walls (A over B) on one form: the first block's labels
    # define the cell map, and the second block repeats it `wallOffset` rows lower.
    inputs, horizon, label_rows = {}, None, []
    for row in ws.iter_rows():
        for c in row:
            v = label(c.value)
            if v == label("TEST PIT#:"):
                label_rows.append(c.row)
            if v in LABELS and LABELS[v] not in inputs:
                inputs[LABELS[v]] = f"{get_column_letter(c.column + 1)}{c.row}"
            if v == "HORIZON" and horizon is None:
                cols = {}
                for h in ws[c.row]:
                    key = HORIZON_COLUMNS.get(label(h.value))
                    if key:
                        cols[key] = h.column_letter
                horizon = {"headerRow": c.row, "firstRow": c.row + 1, "columns": cols}
    if horizon is None or len(inputs) != len(HEADER_LABELS):
        sys.exit(f"template labels not found: inputs={inputs} horizon={horizon}")
    wall_offset = label_rows[1] - label_rows[0] if len(label_rows) > 1 else 0

    # Horizon rows: consecutive bordered rows under the header.
    r = horizon["firstRow"]
    while ws.cell(r, 1).border.bottom.style:
        r += 1
    horizon["rows"] = r - horizon["firstRow"]
    horizon["rowHeight"] = ws.row_dimensions[horizon["firstRow"] + 1].height

    input_cells = set(inputs.values())
    for i in range(horizon["rows"]):
        for col in horizon["columns"].values():
            input_cells.add(f"{col}{horizon['firstRow'] + i}")
    if wall_offset:
        wall_first = int(inputs["testPitLabel"][1:])
        for addr in list(input_cells):
            col, row = addr[0], int(addr[1:])
            if row >= wall_first:
                input_cells.add(f"{col}{row + wall_offset}")

    cells, areas = {}, {}
    for row in ws.iter_rows():
        for c in row:
            v = label(c.value)
            if v in AREA_LABELS and AREA_LABELS[v] not in areas:
                areas[AREA_LABELS[v]] = {"label": c.coordinate}
            s = style_of(c)
            keep_value = c.value not in (None, "") and c.coordinate not in input_cells and "fill" not in s
            if not keep_value and "border" not in s and "fill" not in s and not c.comment:
                continue
            if keep_value:
                s["value"] = c.value
            if c.comment:
                s["comment"] = c.comment.text.replace("Houser:", "").strip()
            cells[c.coordinate] = s

    # Photo/location boxes: yellow cells below each area label, same column span.
    for key, area in areas.items():
        lab = ws[area["label"]]
        filled = [(cell.row, cell.column) for cell in (ws[k] for k in cells if "fill" in cells[k])
                  if lab.row < cell.row < (label_rows[0] + wall_offset if wall_offset else 10**6) and lab.column <= cell.column <= lab.column + 2]
        if not filled:
            sys.exit(f"no input box found under {area['label']} ({key})")
        if filled:
            area["range"] = f"{get_column_letter(min(c for _, c in filled))}{min(r for r, _ in filled)}:" \
                            f"{get_column_letter(max(c for _, c in filled))}{max(r for r, _ in filled)}"

    # Pictures: read the drawing XML directly (openpyxl drops images without Pillow).
    images = []
    ns = {"xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
          "a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
    with zipfile.ZipFile(src_xlsx) as z:
        media = sorted(n for n in z.namelist() if n.startswith("xl/media/"))
        if len(media) != 1:
            sys.exit(f"expected exactly one picture (the logo), found {media}")
        logo = "logo" + os.path.splitext(media[0])[1]
        open(os.path.join(out_dir, logo), "wb").write(z.read(media[0]))
        root = ET.fromstring(z.read("xl/drawings/drawing1.xml"))
        for anchor in root:
            fr = anchor.find("xdr:from", ns)
            ext = anchor.find(".//a:xfrm/a:ext", ns)
            if ext is None:  # one-cell anchors written by tools/xls_to_xlsx.py
                ext = anchor.find("xdr:ext", ns)
            images.append({
                "file": logo,
                "from": {k: int(fr.find(f"xdr:{k}", ns).text) for k in ("col", "colOff", "row", "rowOff")},
                "extEmu": {"cx": int(ext.get("cx")), "cy": int(ext.get("cy"))},
            })

    ps = ws.page_setup
    m = ws.page_margins
    snapshot = {
        "kind": "soil-log",
        "source": {
            "path": r"Office\Tools\Wastewater Tools\SEPTIC\SITE EVALUATION\Soil Log Template.xls",
            "sha256": hashlib.sha256(raw).hexdigest(),
            "modified": datetime.fromtimestamp(os.path.getmtime(src_xls), timezone.utc).isoformat(),
            "snapshotAt": datetime.now(timezone.utc).isoformat(),
        },
        "sheetName": ws.title,
        "columns": {k: round(v.width, 4) for k, v in ws.column_dimensions.items() if v.width},
        "rows": {str(k): v.height for k, v in sorted(ws.row_dimensions.items()) if v.height},
        "pageSetup": {
            "paperSize": int(ps.paperSize or 1),
            "orientation": ps.orientation or "portrait",
            "fitToPage": bool(ws.sheet_properties.pageSetUpPr and ws.sheet_properties.pageSetUpPr.fitToPage),
            "fitToWidth": 1,
            "fitToHeight": 1,
            "margins": {"left": m.left, "right": m.right, "top": m.top, "bottom": m.bottom,
                        "header": m.header, "footer": m.footer},
        },
        "inputs": inputs,
        "horizonTable": horizon,
        "wallOffset": wall_offset,
        "areas": areas,
        "images": images,
        "cells": cells,
    }
    with open(os.path.join(out_dir, "snapshot.json"), "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=1, default=str)
        f.write("\n")
    print(f"snapshot written: {len(cells)} cells, inputs {inputs}, horizon {horizon}, areas {areas}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
