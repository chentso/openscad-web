import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from project root or backend folder
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

def find_openscad_binary() -> str:
    # 1. Environment variable override
    env_bin = os.getenv("OPENSCAD_PATH")
    if env_bin and os.path.exists(env_bin):
        return env_bin

    # 2. Check local extracted bin directory
    bin_dir = Path(__file__).resolve().parent.parent / "bin" / "openscad"
    if bin_dir.exists():
        for p in bin_dir.rglob("openscad.com"):
            if p.is_file():
                return str(p)
        for p in bin_dir.rglob("openscad.exe"):
            if p.is_file():
                return str(p)

    # 3. Fallback to system command
    return "openscad"

def find_models_dir() -> Path:
    d = Path(__file__).resolve().parent.parent.parent / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d

def find_libraries_dir() -> Path:
    d = Path(__file__).resolve().parent.parent.parent / "libraries"
    d.mkdir(parents=True, exist_ok=True)
    return d

def find_slicer_inbox_dir() -> Path:
    env_dir = os.getenv("SLICER_INBOX_DIR")
    if env_dir:
        d = Path(env_dir)
    else:
        d = Path(__file__).resolve().parent.parent.parent / "slicer_inbox"
    d.mkdir(parents=True, exist_ok=True)
    return d

class Settings(BaseModel):
    OPENSCAD_PATH: str = find_openscad_binary()
    MODELS_DIR: Path = find_models_dir()
    LIBRARIES_DIR: Path = find_libraries_dir()
    SLICER_INBOX_DIR: Path = find_slicer_inbox_dir()
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")

settings = Settings()
