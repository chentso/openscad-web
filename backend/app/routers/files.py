import os
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from ..config import settings

router = APIRouter(prefix="/api/files", tags=["files"])

def safe_filename(name: str) -> str:
    # Remove any directory path components
    base = os.path.basename(name.strip())
    # Disallow path traversal or hidden files
    if not base or ".." in base or base.startswith("."):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename"
        )
    # Ensure .scad extension
    if not base.endswith(".scad"):
        base += ".scad"
    # Ensure valid characters (alphanumeric, underscore, hyphen, space, dot)
    if not re.match(r"^[\w\-. ]+\.scad$", base):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename contains invalid characters"
        )
    return base

class FileItem(BaseModel):
    name: str
    size: int
    size_formatted: str
    modified_timestamp: float
    modified_formatted: str

class SaveFileRequest(BaseModel):
    filename: str = Field(..., description="Name of the file (e.g. box.scad)")
    content: str = Field(..., description="OpenSCAD source code")

class RenameFileRequest(BaseModel):
    old_filename: str = Field(..., description="Existing file name")
    new_filename: str = Field(..., description="New file name")

def format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"

@router.get("/", response_model=List[FileItem])
def list_files():
    """List all .scad model files stored on the server"""
    models_dir = settings.MODELS_DIR
    models_dir.mkdir(parents=True, exist_ok=True)
    
    items: List[FileItem] = []
    for entry in sorted(models_dir.glob("*.scad"), key=lambda p: p.stat().st_mtime, reverse=True):
        if entry.is_file():
            stat = entry.stat()
            dt = datetime.fromtimestamp(stat.st_mtime)
            items.append(FileItem(
                name=entry.name,
                size=stat.st_size,
                size_formatted=format_size(stat.st_size),
                modified_timestamp=stat.st_mtime,
                modified_formatted=dt.strftime("%b %d, %Y %I:%M %p")
            ))
    return items

@router.get("/{filename}")
def load_file(filename: str):
    """Load the content of a specific .scad file from the server"""
    clean_name = safe_filename(filename)
    target_path = settings.MODELS_DIR / clean_name

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{clean_name}' not found on server"
        )

    try:
        content = target_path.read_text(encoding="utf-8")
        stat = target_path.stat()
        dt = datetime.fromtimestamp(stat.st_mtime)
        return {
            "name": clean_name,
            "content": content,
            "size": stat.st_size,
            "size_formatted": format_size(stat.st_size),
            "modified_formatted": dt.strftime("%b %d, %Y %I:%M %p")
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read file: {str(e)}"
        )

@router.post("/save")
def save_file(req: SaveFileRequest):
    """Save or overwrite a .scad model on the server"""
    clean_name = safe_filename(req.filename)
    target_path = settings.MODELS_DIR / clean_name

    try:
        target_path.write_text(req.content, encoding="utf-8")
        stat = target_path.stat()
        dt = datetime.fromtimestamp(stat.st_mtime)
        return {
            "success": True,
            "name": clean_name,
            "size": stat.st_size,
            "size_formatted": format_size(stat.st_size),
            "modified_formatted": dt.strftime("%b %d, %Y %I:%M %p")
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )

@router.delete("/{filename}")
def delete_file(filename: str):
    """Delete a .scad file from the server"""
    clean_name = safe_filename(filename)
    target_path = settings.MODELS_DIR / clean_name

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{clean_name}' not found on server"
        )

    try:
        target_path.unlink()
        return {"success": True, "deleted": clean_name}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {str(e)}"
        )

@router.post("/rename")
def rename_file(req: RenameFileRequest):
    """Rename a .scad file on the server"""
    clean_old = safe_filename(req.old_filename)
    clean_new = safe_filename(req.new_filename)

    old_path = settings.MODELS_DIR / clean_old
    new_path = settings.MODELS_DIR / clean_new

    if not old_path.exists() or not old_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{clean_old}' not found"
        )

    if new_path.exists() and clean_old != clean_new:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{clean_new}' already exists"
        )

    try:
        old_path.rename(new_path)
        return {"success": True, "old_name": clean_old, "new_name": clean_new}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rename file: {str(e)}"
        )
