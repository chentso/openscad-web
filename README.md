# OpenSCAD Web (OpenSCAD AI Studio) 🚀

> A modern, high-performance web-based OpenSCAD development environment powered by the native **OpenSCAD Nightly** engine with **Manifold** support and integrated with **Google Gemini AI** for natural-language CAD generation, automated compiler self-healing, and 3D visual inspections.

---

## Key Features

1. **Native Nightly & Manifold Performance**:
   - Spawns the native OpenSCAD Nightly binary with `--backend=Manifold` for sub-20ms CSG compilation.
   - High-throughput geometry caching and true 3D binary STL generation.
2. **Google Gemini CAD Copilot**:
   - **Interactive AI Pair Programming**: Conversational sidebar powered by Gemini (3.5 Flash, 3.8 Flash, 2.5 Pro) to generate, optimize, and edit OpenSCAD geometry.
   - **1-Click Apply**: Seamlessly updates the code editor with full undo/redo history.
   - **Autonomous Compiler Self-Healing**: Automatically catches compiler errors and fixes non-manifold or syntax bugs with one click.
   - **Multimodal 3D Vision Review**: Takes an off-screen snapshot of the rendered Three.js canvas and submits it to Gemini Vision to inspect structural integrity and ergonomics.
3. **Monaco CAD Editor**:
   - Custom Monarch tokenizer for OpenSCAD syntax highlighting.
   - Keyboard shortcuts (`F5` or `Ctrl+Enter` to re-render, `Ctrl+S` to save).
   - Draggable resizer edge dividers for full layout customization.
4. **Three.js 3D Viewport**:
   - Faithful OpenSCAD coordinate system (Z-up orientation, 25° elevation / 55° azimuth isometric perspective, continuous ruler crosshair axes with 10mm tick marks).
   - Orbit controls, wireframe mode, bounding-box centering, and live rendering metrics.
5. **Interactive Parametric Customizer**:
   - Parses OpenSCAD parameter annotations (`/* [Parameters] */`, `width = 45; // [20:100]`) into live sliders and checkboxes.
6. **Server File Management & Auto-Save**:
   - Automatically saves project drafts with timestamped filenames (`model_YYYYMMDD_HHMMSS.scad`) into `models/`.
   - Continuous auto-save with debouncing.
   - Unsaved changes reload protection (`beforeunload` confirmation).
   - Model browser to open, rename, upload, and delete `.scad` files directly on the server.
7. **3D Slicer Integration Ready**:
   - Export `.stl`, `.3mf`, `.scad`, and `.png` snapshots.
   - Shared slicer inbox architecture compatible with Bambu Studio, FlashPrint, and OrcaSlicer.

---

## Project Structure

```text
openscad-web/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI server entry point & CORS
│   │   ├── config.py              # Configuration & OpenSCAD binary discovery
│   │   ├── routers/
│   │   │   ├── render.py          # Native OpenSCAD compile, download, snapshot
│   │   │   ├── gemini.py          # Gemini chat streaming, auto-fix, vision review
│   │   │   └── files.py           # Server model CRUD & file management
│   │   └── services/
│   │       ├── openscad_runner.py # Native OpenSCAD CLI process manager
│   │       └── gemini_service.py  # Google GenAI SDK integration
│   ├── requirements.txt
│   └── .venv/
├── frontend/
│   ├── src/
│   │   ├── components/            # Viewport3D, Editor, Customizer, ChatSidebar, FileManagerModal
│   │   ├── App.tsx                # Main 3-column resizable layout
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── models/                        # Server model projects repository
└── .env.example                   # Environment configuration template
```

---

## Getting Started

### 1. Prerequisites
- Python 3.11+
- Node.js 18+
- [OpenSCAD Nightly](https://openscad.org/downloads.html#snapshots) with Manifold support.

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate | Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the project root:
```bash
cp .env.example .env
```
Add your Google Gemini API key to `.env` (optional, can also be configured in the web UI):
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Start the FastAPI backend server:
```bash
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit **`http://127.0.0.1:5173/`** in your browser.

---

## License
MIT License.
