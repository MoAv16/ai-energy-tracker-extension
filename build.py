"""
Build-Script: Packt den extension/-Ordner als ZIP ins Projekt-Root.
Dateiname: moav16-ai-energy-monitor.v{version}.zip
"""

import json
import os
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT_DIR = os.path.join(ROOT, "extension")
MANIFEST = os.path.join(EXT_DIR, "manifest.json")

with open(MANIFEST, "r", encoding="utf-8") as f:
    manifest = json.load(f)

current = manifest["version"]
new_version = input(f"Version [{current}]: ").strip()

if new_version and new_version != current:
    manifest["version"] = new_version
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Version: {current} -> {new_version}")
else:
    new_version = current
    print(f"Version: {new_version}")

output = os.path.join(ROOT, f"moav16-ai-energy-monitor.v{new_version}.zip")

with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(EXT_DIR):
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            arcname = os.path.relpath(full, EXT_DIR)
            zf.write(full, arcname)

print(f"-> {output}")
