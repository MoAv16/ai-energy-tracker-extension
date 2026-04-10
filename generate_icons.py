"""
Generate extension icons by resizing the official logo PNG.

Requires: pip install Pillow
"""

from PIL import Image
import os

def generate_icons():
    root = os.path.dirname(__file__)
    src = os.path.join(root, "Logo", "AI Monitor - Logo 128px.png")
    out_dir = os.path.join(root, "extension", "icons")

    img128 = Image.open(src).convert("RGBA")

    sizes = {
        128: img128,
        48: img128.resize((48, 48), Image.LANCZOS),
        16: img128.resize((16, 16), Image.LANCZOS),
    }

    for size, img in sizes.items():
        path = os.path.join(out_dir, f"icon{size}.png")
        img.save(path, "PNG")
        print(f"Generated {path}")

    print("Done.")


if __name__ == "__main__":
    generate_icons()
