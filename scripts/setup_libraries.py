"""
Script to install and update standard OpenSCAD libraries:
1. BOSL2
2. Round-Anything
3. dotSCAD
4. NopSCADlib
5. Catch'n'Hole
6. YAPP
7. threads.scad
8. pins.scad
"""

import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
LIB_DIR = ROOT_DIR / "libraries"
LIB_DIR.mkdir(parents=True, exist_ok=True)

REPOS = {
    "BOSL2": "https://github.com/BelfrySCAD/BOSL2.git",
    "Round-Anything": "https://github.com/Irev-Dev/Round-Anything.git",
    "dotSCAD": "https://github.com/JustinSDK/dotSCAD.git",
    "NopSCADlib": "https://github.com/nophead/NopSCADlib.git",
    "catchnhole": "https://github.com/mmalecki/catchnhole.git",
    "YAPP": "https://github.com/mrWheel/YAPP_Box.git",
}

STANDALONE_FILES = {
    "pins.scad": "https://raw.githubusercontent.com/tbuser/pin_connectors/master/pins.scad",
    "threads.scad": "http://dkprojects.net/openscad-threads/threads.scad",
}

def setup_libraries():
    print(f"Installing OpenSCAD libraries into: {LIB_DIR}")
    for name, url in REPOS.items():
        dest = LIB_DIR / name
        if not dest.exists():
            print(f"Cloning {name} from {url}...")
            subprocess.run(["git", "clone", "--depth", "1", url, str(dest)], check=True)
        else:
            print(f"Library {name} already exists.")

    for fname, url in STANDALONE_FILES.items():
        dest = LIB_DIR / fname
        if not dest.exists():
            print(f"Downloading {fname} from {url}...")
            urllib.request.urlretrieve(url, str(dest))
        else:
            print(f"File {fname} already exists.")

    # Also sync to user Documents/OpenSCAD/libraries for native OpenSCAD GUI
    docs_lib = Path.home() / "Documents" / "OpenSCAD" / "libraries"
    try:
        docs_lib.mkdir(parents=True, exist_ok=True)
        for item in LIB_DIR.iterdir():
            target = docs_lib / item.name
            if item.is_dir() and not target.exists():
                shutil.copytree(str(item), str(target))
            elif item.is_file() and not target.exists():
                shutil.copy2(str(item), str(target))
        print(f"Libraries synced to user Documents: {docs_lib}")
    except Exception as e:
        print(f"Note: Could not sync to Documents/OpenSCAD/libraries: {e}")

    print("All OpenSCAD libraries are installed and ready!")

if __name__ == "__main__":
    setup_libraries()
