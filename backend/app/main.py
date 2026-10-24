from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import render, gemini, files

app = FastAPI(
    title="OpenSCAD AI Studio Server",
    description="FastAPI server integrating OpenSCAD Nightly native engine with Google Gemini Copilot",
    version="1.0.0"
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(render.router)
app.include_router(gemini.router)
app.include_router(files.router)

@app.get("/")
def root():
    return {
        "service": "OpenSCAD AI Studio Backend",
        "openscad_binary": settings.OPENSCAD_PATH,
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
