import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "static", "icons")
os.makedirs(OUT, exist_ok=True)


def make(size):
    margin, thickness = size * 0.27, size * 0.11
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            on = False
            if margin <= x <= size - margin and margin <= y <= size - margin:
                if y < margin + thickness or y > size - margin - thickness:
                    on = True
                else:
                    on = abs(x - ((size - margin) - (y - margin))) < thickness * 0.8
            row += bytes((255, 255, 255)) if on else bytes((16, 75, 155))
        rows.append(bytes(row))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )
    with open(os.path.join(OUT, f"icon-{size}.png"), "wb") as output:
        output.write(png)


for size in (192, 512):
    make(size)
print("icons written to", os.path.abspath(OUT))
