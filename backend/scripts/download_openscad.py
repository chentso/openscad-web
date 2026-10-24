import os
import sys
import re
import urllib.request
import zipfile
import shutil

BASE_URL = "https://files.openscad.org/snapshots/"
TARGET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "bin", "openscad"))

def download_and_extract():
    print(f"Checking for latest OpenSCAD nightly at {BASE_URL}...")
    req = urllib.request.Request(BASE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    
    # Match OpenSCAD-YYYY.MM.DD-x86-64.zip
    matches = re.findall(r'href=["\'](OpenSCAD-\d{4}\.\d{2}\.\d{2}-x86-64\.zip)["\']', html)
    if not matches:
        raise RuntimeError("No matching OpenSCAD snapshot zip found!")
    
    latest_zip_name = sorted(matches)[-1]
    download_url = BASE_URL + latest_zip_name
    print(f"Found latest snapshot: {latest_zip_name}")
    print(f"Downloading from: {download_url}")
    
    os.makedirs(TARGET_DIR, exist_ok=True)
    temp_zip = os.path.join(TARGET_DIR, "openscad_latest.zip")
    
    def report_hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = downloaded / total_size * 100
            if block_num % 500 == 0:
                print(f"Downloading: {downloaded / 1024 / 1024:.1f}MB / {total_size / 1024 / 1024:.1f}MB ({percent:.1f}%)")
    
    urllib.request.urlretrieve(download_url, temp_zip, reporthook=report_hook)
    print(f"Download complete: {os.path.getsize(temp_zip) / 1024 / 1024:.1f} MB")
    
    print(f"Extracting to {TARGET_DIR}...")
    with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
        zip_ref.extractall(TARGET_DIR)
    
    os.remove(temp_zip)
    print("Extraction complete!")
    
    # Locate openscad.exe or openscad.com
    for root, dirs, files in os.walk(TARGET_DIR):
        for f in files:
            if f.lower() in ["openscad.exe", "openscad.com"]:
                print(f"Found binary: {os.path.join(root, f)}")
                return os.path.join(root, f)
    
    print("Warning: openscad binary not found directly in target directory.")
    return None

if __name__ == "__main__":
    download_and_extract()
