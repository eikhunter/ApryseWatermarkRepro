#!/usr/bin/env python3
"""Generate large, synthetic PDFs without customer documents or third-party data."""

from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "fixtures"
DOCUMENTS = (
    ("synthetic-6154-pages.pdf", 6154, 20 * 1024 * 1024),
    ("synthetic-11717-pages.pdf", 11717, 52 * 1024 * 1024),
)


def pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_pdf(path: Path, page_count: int, target_bytes: int) -> None:
    # Each page owns a content stream so PTStamper must mutate every page. Random-looking,
    # deterministic comments keep the file near the requested size without external assets.
    bytes_per_page = max(256, (target_bytes // page_count) - 180)
    objects: list[bytes] = []
    page_ids = [4 + index * 2 for index in range(page_count)]

    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{object_id} 0 R" for object_id in page_ids)
    objects.append(
        f"<< /Type /Pages /Count {page_count} /Kids [{kids}] >>".encode()
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for index, page_id in enumerate(page_ids, start=1):
        content_id = page_id + 1
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 3 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            ).encode()
        )
        visible = (
            f"BT /F1 18 Tf 72 720 Td "
            f"(Synthetic large-document repro - page {index} of {page_count}) Tj ET\n"
        )
        # Fill the target size with real painting operators rather than ignored comments.
        # This forces the viewer to parse and rasterize dense vector/text content on every
        # page while remaining deterministic and free of customer data.
        commands: list[str] = []
        for item in range(96):
            x = 24 + ((item * 47 + index) % 540)
            y = 36 + ((item * 31 + index) % 680)
            width = 8 + (item % 29)
            height = 5 + (item % 17)
            red = ((item * 13) % 80) / 100
            green = ((item * 7) % 70) / 100
            blue = ((item * 19) % 90) / 100
            commands.append(
                f"{red:.2f} {green:.2f} {blue:.2f} RG "
                f"{x} {y} {width} {height} re S\n"
            )
            if item % 4 == 0:
                label = pdf_text(f"object {item} page {index}")
                commands.append(
                    f"BT /F1 7 Tf 1 0 0 1 {x} {y} Tm ({label}) Tj ET\n"
                )

        prefix = visible + "q\n0.6 w\n"
        suffix = "Q\n"
        body = prefix
        command_index = 0
        while True:
            command = commands[command_index % len(commands)]
            if len(body) + len(command) + len(suffix) > bytes_per_page:
                break
            body += command
            command_index += 1
        body += suffix
        padding = max(0, bytes_per_page - len(body))
        body += ("%" + ("x" * max(0, padding - 2)) + "\n")[:padding]
        stream = body.encode()
        objects.append(
            f"<< /Length {len(stream)} >>\nstream\n".encode()
            + stream
            + b"\nendstream"
        )

    with path.open("wb") as output:
        output.write(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for object_id, body in enumerate(objects, start=1):
            offsets.append(output.tell())
            output.write(f"{object_id} 0 obj\n".encode())
            output.write(body)
            output.write(b"\nendobj\n")

        xref = output.tell()
        output.write(f"xref\n0 {len(objects) + 1}\n".encode())
        output.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.write(f"{offset:010d} 00000 n \n".encode())
        output.write(
            (
                f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
                f"startxref\n{xref}\n%%EOF\n"
            ).encode()
        )


def linearize(path: Path) -> None:
    qpdf = shutil.which("qpdf")
    if not qpdf:
        print(f"Generated {path.name} (install qpdf and rerun to linearize)")
        return

    linearized = path.with_suffix(".linearized.pdf")
    subprocess.run(
        [qpdf, "--linearize", "--stream-data=preserve", str(path), str(linearized)],
        check=True,
    )
    linearized.replace(path)
    print(f"Generated and linearized {path.name}")


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    for filename, page_count, target_bytes in DOCUMENTS:
        destination = OUTPUT_DIR / filename
        write_pdf(destination, page_count, target_bytes)
        linearize(destination)


if __name__ == "__main__":
    main()
