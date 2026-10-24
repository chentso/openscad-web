import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Dict, Any, Optional
from ..config import settings

class OpenSCADRunner:
    def __init__(self, binary_path: Optional[str] = None):
        self.binary_path = binary_path or settings.OPENSCAD_PATH

    def get_version(self) -> Dict[str, Any]:
        try:
            res = subprocess.run(
                [self.binary_path, "--version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5
            )
            out = res.stdout.strip() or res.stderr.strip()
            return {"success": res.returncode == 0, "version": out}
        except Exception as e:
            return {"success": False, "error": str(e), "binary_path": self.binary_path}

    def render_mesh(
        self,
        scad_code: str,
        export_format: str = "stl",
        enable_manifold: bool = True,
        timeout_seconds: int = 45
    ) -> Dict[str, Any]:
        """
        Compiles OpenSCAD code and outputs 3D mesh (STL or 3MF).
        Returns dict with status, output_bytes, stdout, stderr, render_time.
        """
        export_format = export_format.lower()
        if export_format not in ["stl", "3mf", "csg", "dxf"]:
            export_format = "stl"

        start_time = time.time()
        with tempfile.TemporaryDirectory() as tmp_dir:
            scad_path = os.path.join(tmp_dir, "input.scad")
            out_path = os.path.join(tmp_dir, f"output.{export_format}")

            with open(scad_path, "w", encoding="utf-8") as f:
                f.write(scad_code)

            cmd = [self.binary_path]
            if enable_manifold:
                cmd.append("--backend=Manifold")
            else:
                cmd.append("--backend=CGAL")
            if export_format == "stl":
                cmd.append("--export-format=binstl")
            cmd.extend(["-o", out_path, scad_path])

            try:
                proc = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=timeout_seconds
                )
                duration = time.time() - start_time
                stdout_text = proc.stdout
                stderr_text = proc.stderr
                print(f"[OpenSCAD Runner] exit={proc.returncode}, duration={duration:.2f}s, out_exists={os.path.exists(out_path)}")
                if proc.stdout:
                    print(f"[OpenSCAD stdout]: {proc.stdout.strip()}")
                if proc.stderr:
                    print(f"[OpenSCAD stderr]: {proc.stderr.strip()}")
                has_errors = "ERROR:" in stderr_text or proc.returncode != 0

                output_bytes = None
                if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                    with open(out_path, "rb") as out_f:
                        output_bytes = out_f.read()

                return {
                    "success": proc.returncode == 0 and output_bytes is not None,
                    "returncode": proc.returncode,
                    "stdout": stdout_text,
                    "stderr": stderr_text,
                    "render_time_ms": int(duration * 1000),
                    "output_bytes": output_bytes,
                    "format": export_format,
                    "size_bytes": len(output_bytes) if output_bytes else 0
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "error": f"Render timed out after {timeout_seconds} seconds",
                    "stdout": "",
                    "stderr": f"Compilation timed out after {timeout_seconds}s."
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e),
                    "stdout": "",
                    "stderr": str(e)
                }

    def render_png(
        self,
        scad_code: str,
        width: int = 800,
        height: int = 600,
        enable_manifold: bool = True,
        timeout_seconds: int = 30
    ) -> Dict[str, Any]:
        """
        Renders an offscreen preview snapshot image (PNG) using native OpenSCAD.
        """
        start_time = time.time()
        with tempfile.TemporaryDirectory() as tmp_dir:
            scad_path = os.path.join(tmp_dir, "input.scad")
            out_png = os.path.join(tmp_dir, "preview.png")

            with open(scad_path, "w", encoding="utf-8") as f:
                f.write(scad_code)

            cmd = [
                self.binary_path,
                "--render",
                f"--imgsize={width},{height}",
                "--autocenter",
                "--viewall"
            ]
            if enable_manifold:
                cmd.append("--backend=Manifold")
            else:
                cmd.append("--backend=CGAL")
            cmd.extend(["-o", out_png, scad_path])

            try:
                proc = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=timeout_seconds
                )
                duration = time.time() - start_time
                output_bytes = None
                if os.path.exists(out_png) and os.path.getsize(out_png) > 0:
                    with open(out_png, "rb") as out_f:
                        output_bytes = out_f.read()

                return {
                    "success": proc.returncode == 0 and output_bytes is not None,
                    "stdout": proc.stdout,
                    "stderr": proc.stderr,
                    "render_time_ms": int(duration * 1000),
                    "png_bytes": output_bytes
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e),
                    "stdout": "",
                    "stderr": str(e)
                }

openscad_runner = OpenSCADRunner()
