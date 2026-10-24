import base64
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from typing import Optional, Literal
from ..services.openscad_runner import openscad_runner

router = APIRouter(prefix="/api/render", tags=["render"])

class RenderRequest(BaseModel):
    code: str = Field(..., description="OpenSCAD source code")
    format: Literal["stl", "3mf", "csg"] = Field("stl", description="Mesh format to compile to")
    enable_manifold: bool = Field(True, description="Enable high-performance Manifold engine")

class SnapshotRequest(BaseModel):
    code: str = Field(..., description="OpenSCAD source code")
    width: int = Field(800, ge=100, le=3840)
    height: int = Field(600, ge=100, le=2160)
    enable_manifold: bool = Field(True, description="Enable Manifold engine")

@router.get("/status")
def get_status():
    ver = openscad_runner.get_version()
    return {
        "status": "ready" if ver.get("success") else "error",
        "binary_path": openscad_runner.binary_path,
        "version_info": ver.get("version", ""),
        "error": ver.get("error")
    }

@router.post("/compile")
def compile_mesh(req: RenderRequest):
    result = openscad_runner.render_mesh(
        scad_code=req.code,
        export_format=req.format,
        enable_manifold=req.enable_manifold
    )

    mesh_b64 = None
    if result.get("output_bytes"):
        mesh_b64 = base64.b64encode(result["output_bytes"]).decode("utf-8")

    return {
        "success": result["success"],
        "format": result.get("format", req.format),
        "render_time_ms": result.get("render_time_ms", 0),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "error": result.get("error"),
        "mesh_base64": mesh_b64
    }

@router.post("/download")
def download_mesh(req: RenderRequest):
    result = openscad_runner.render_mesh(
        scad_code=req.code,
        export_format=req.format,
        enable_manifold=req.enable_manifold
    )
    if not result["success"] or not result.get("output_bytes"):
        raise HTTPException(status_code=400, detail=result.get("stderr") or "Compilation failed")

    media_type = "model/stl" if req.format == "stl" else "application/octet-stream"
    filename = f"model.{req.format}"

    return Response(
        content=result["output_bytes"],
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("/snapshot")
def render_snapshot(req: SnapshotRequest):
    result = openscad_runner.render_png(
        scad_code=req.code,
        width=req.width,
        height=req.height,
        enable_manifold=req.enable_manifold
    )
    png_b64 = None
    if result.get("png_bytes"):
        png_b64 = base64.b64encode(result["png_bytes"]).decode("utf-8")

    return {
        "success": result["success"],
        "render_time_ms": result.get("render_time_ms", 0),
        "stdout": result.get("stdout", ""),
        "stderr": result.get("stderr", ""),
        "error": result.get("error"),
        "png_base64": png_b64
    }
