import urllib.request
import re
import sys

try:
    req = urllib.request.Request("https://files.openscad.org/snapshots/", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
        files = re.findall(r'href=["\']([^"\']+)["\']', html)
        zips = [f for f in files if "x86-64.zip" in f]
        exes = [f for f in files if "x86-64" in f and f.endswith(".exe")]
        print(f"Total zips: {len(zips)}, Total exes: {len(exes)}")
        if zips:
            print("Latest zips:", zips[-5:])
        if exes:
            print("Latest exes:", exes[-5:])
except Exception as e:
    print("Error:", e, file=sys.stderr)
