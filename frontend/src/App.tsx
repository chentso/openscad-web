import { useState, useEffect, useRef, useCallback } from "react";
import { Editor } from "./components/Editor";
import { Viewport3D } from "./components/Viewport3D";
import type { Viewport3DHandle } from "./components/Viewport3D";
import { ChatSidebar } from "./components/ChatSidebar";
import { Customizer } from "./components/Customizer";
import { FileManagerModal } from "./components/FileManagerModal";
import {
  Play, Download, Terminal, Settings as SettingsIcon,
  Code, Sliders, ChevronDown, Cpu, Save, FolderOpen, Check, FilePlus, Loader2
} from "lucide-react";

function generateTimestampedName(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `model_${year}${month}${day}_${hours}${mins}${secs}.scad`;
}

const NEW_MODEL_TEMPLATE = `// New OpenSCAD Model
$fn = 32;

// Start designing your model here:
cube([20, 20, 20], center = true);
`;

const DEFAULT_SCAD = `/* [Parameters] */
// Width of the box in mm
width = 45; // [20:100]

// Depth of the box in mm
depth = 35; // [20:80]

// Height of the box in mm
height = 25; // [10:60]

// Wall thickness in mm
wall_thickness = 2.5; // [1:0.5:5]

// Corner rounding radius
corner_radius = 4; // [0:10]

// Add center hole
center_hole = true;

// Level of detail
$fn = 32;

module rounded_cube(size, r) {
  x = size[0];
  y = size[1];
  z = size[2];
  hull() {
    translate([r, r, 0]) cylinder(r=r, h=z);
    translate([x - r, r, 0]) cylinder(r=r, h=z);
    translate([r, y - r, 0]) cylinder(r=r, h=z);
    translate([x - r, y - r, 0]) cylinder(r=r, h=z);
  }
}

difference() {
  // Outer enclosure
  rounded_cube([width, depth, height], corner_radius);

  // Inner hollow cavity
  translate([wall_thickness, wall_thickness, wall_thickness])
    rounded_cube(
      [width - 2 * wall_thickness, depth - 2 * wall_thickness, height],
      max(1, corner_radius - wall_thickness)
    );

  // Center cable / ventilation port
  if (center_hole) {
    translate([width / 2, depth / 2, -1])
      cylinder(r=6, h=wall_thickness + 2);
  }
}
`;

export function App() {
  const [code, setCode] = useState(DEFAULT_SCAD);
  const [activeTab, setActiveTab] = useState<"editor" | "customizer">("editor");
  const [autoRender, setAutoRender] = useState(true);

  const [stlData, setStlData] = useState<ArrayBuffer | string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [renderTimeMs, setRenderTimeMs] = useState<number | undefined>();
  const [consoleLogs, setConsoleLogs] = useState<string>("");
  const [lastCompilerError, setLastCompilerError] = useState<string | undefined>();
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  // Server File Management & Auto-Save state
  const [currentFilename, setCurrentFilename] = useState<string>("parametric_box.scad");
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [fileManagerMode, setFileManagerMode] = useState<"browse" | "save_as">("browse");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<any>(null);

  // API Key & Backend status
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"connected" | "disconnected">("disconnected");
  const [backendVersion, setBackendVersion] = useState("OpenSCAD Nightly");

  const viewportRef = useRef<Viewport3DHandle>(null);
  const debounceTimerRef = useRef<any>(null);

  // Panel Resizing State
  const [editorWidth, setEditorWidth] = useState(440);
  const [chatWidth, setChatWidth] = useState(360);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  // Global mouse move and mouse up listeners for smooth resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const maxWidth = Math.max(300, window.innerWidth - chatWidth - 250);
        const newWidth = Math.min(Math.max(260, e.clientX), maxWidth);
        setEditorWidth(newWidth);
      } else if (isDraggingRight) {
        const maxWidth = Math.max(300, window.innerWidth - editorWidth - 250);
        const newWidth = Math.min(Math.max(260, window.innerWidth - e.clientX), maxWidth);
        setChatWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDraggingLeft, isDraggingRight, editorWidth, chatWidth]);

  // Check backend & gemini status on mount
  useEffect(() => {
    fetch("/api/render/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "ready") {
          setBackendStatus("connected");
          setBackendVersion(data.version_info || "OpenSCAD Nightly");
        }
      })
      .catch(() => setBackendStatus("disconnected"));

    fetch("/api/gemini/status")
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(data.configured);
      })
      .catch(() => {});
  }, []);

  // Core Render Function via Native OpenSCAD Nightly (FastAPI backend)
  const executeRender = useCallback(async (scadCode: string) => {
    setIsLoading(true);
    setLastCompilerError(undefined);

    try {
      const res = await fetch("/api/render/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: scadCode,
          format: "stl",
          enable_manifold: true
        })
      });

      const data = await res.json();
      setRenderTimeMs(data.render_time_ms);

      const logs = [data.stdout, data.stderr].filter(Boolean).join("\n");
      setConsoleLogs(logs || `Rendered natively with Manifold in ${data.render_time_ms}ms.`);

      if (data.success && data.mesh_base64) {
        // Decode base64 to binary ArrayBuffer
        const binaryStr = atob(data.mesh_base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        setStlData(bytes.buffer);
      } else {
        const err = data.stderr || data.stdout || data.error || "Native compilation failed";
        setLastCompilerError(err);
        setIsConsoleOpen(true);
      }
    } catch (err: any) {
      setLastCompilerError(err.message || String(err));
      setConsoleLogs(`Error: ${err.message || String(err)}`);
      setIsConsoleOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Toast notification helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // Quick Save current file to server
  const handleQuickSave = useCallback(async () => {
    let targetName = currentFilename;
    if (!targetName || targetName === "untitled.scad") {
      targetName = generateTimestampedName();
      setCurrentFilename(targetName);
    }
    try {
      setIsAutoSaving(true);
      const res = await fetch("/api/files/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: targetName,
          content: code
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setIsDirty(false);
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastSavedTime(timeStr);
      showToast(`Saved to models/${targetName}`);
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsAutoSaving(false);
    }
  }, [currentFilename, code]);

  // Load file into editor
  const handleOpenFile = (filename: string, content: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setCurrentFilename(filename);
    setCode(content);
    setIsDirty(false);
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLastSavedTime(timeStr);
    executeRender(content);
    showToast(`Opened ${filename}`);
  };

  // Clear current model and create a new timestamped model
  const handleNewModel = () => {
    if (isDirty) {
      const confirmDiscard = window.confirm(
        "You have unsaved changes in the current model. Clear editor and start a new model?"
      );
      if (!confirmDiscard) return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const newName = generateTimestampedName();
    setCode(NEW_MODEL_TEMPLATE);
    setCurrentFilename(newName);
    setIsDirty(false);
    executeRender(NEW_MODEL_TEMPLATE);

    // Save initial file to server so it is registered
    fetch("/api/files/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: newName, content: NEW_MODEL_TEMPLATE })
    })
      .then((res) => res.json())
      .then(() => {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLastSavedTime(timeStr);
      })
      .catch(() => {});

    showToast(`Started ${newName}`);
  };

  // Prompt confirmation when refreshing or closing tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to reload?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Global Ctrl+S / Cmd+S shortcut to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleQuickSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleQuickSave]);

  // Initial load on mount: restore the last active model cached by the server
  useEffect(() => {
    fetch("/api/files/last-active")
      .then((res) => res.json())
      .then((data) => {
        if (data.found && data.content) {
          setCurrentFilename(data.filename);
          setCode(data.content);
          setIsDirty(false);
          const timeStr = data.modified_formatted || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setLastSavedTime(timeStr);
          executeRender(data.content);
        } else {
          fetch("/api/files/parametric_box.scad")
            .then((r) => r.json())
            .then((boxData) => {
              if (boxData.content) {
                setCurrentFilename("parametric_box.scad");
                setCode(boxData.content);
                setIsDirty(false);
                executeRender(boxData.content);
              } else {
                executeRender(DEFAULT_SCAD);
              }
            })
            .catch(() => {
              executeRender(DEFAULT_SCAD);
            });
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch last-active model:", err);
        executeRender(DEFAULT_SCAD);
      });
  }, [executeRender]);

  // Code change handler with auto-render & auto-save debouncing
  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    setIsDirty(true);

    try {
      localStorage.setItem("openscad_draft_code", newCode);
    } catch {}

    // Auto-render debounce (500ms)
    if (autoRender) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        executeRender(newCode);
      }, 500);
    }

    // Auto-save debounce (2.5s of typing inactivity)
    if (autoSaveEnabled) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        let targetName = currentFilename;
        if (!targetName || targetName === "untitled.scad") {
          targetName = generateTimestampedName();
          setCurrentFilename(targetName);
        }

        try {
          setIsAutoSaving(true);
          const res = await fetch("/api/files/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: targetName,
              content: newCode
            })
          });
          if (res.ok) {
            setIsDirty(false);
            const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            setLastSavedTime(timeStr);
          }
        } catch (err) {
          console.warn("Auto-save error:", err);
        } finally {
          setIsAutoSaving(false);
        }
      }, 2500);
    }
  };

  // Export File Download Handler
  const handleExport = async (format: "scad" | "stl" | "3mf" | "png") => {
    if (format === "scad") {
      const blob = new Blob([code], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "model.scad";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (format === "png") {
      const snapshot = viewportRef.current?.getSnapshot();
      if (snapshot) {
        const a = document.createElement("a");
        a.href = snapshot;
        a.download = "model_snapshot.png";
        a.click();
      }
      return;
    }

    // Export STL or 3MF via native backend
    try {
      const res = await fetch("/api/render/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          format,
          enable_manifold: true
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `model.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Save API Key
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await fetch("/api/gemini/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKeyInput.trim() })
      });
      if (res.ok) {
        setHasApiKey(true);
        setApiKeyModalOpen(false);
      }
    } catch (e) {
      alert("Failed to save API key");
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* Top Application Bar */}
      <header className="h-12 border-b border-zinc-800 bg-zinc-900 px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center font-bold text-white text-xs shadow">
              CAD
            </div>
            <h1 className="font-semibold text-sm tracking-wide text-zinc-100">
              OpenSCAD <span className="text-orange-500 font-normal">AI Studio</span>
            </h1>
          </div>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          {/* Engine Status Badge */}
          <div className="flex items-center gap-2 bg-zinc-950/80 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs">
            <Cpu size={13} className="text-orange-400" />
            <span className="font-medium text-zinc-300">Native Nightly (Manifold)</span>
            <span
              className={`w-2 h-2 rounded-full ${
                backendStatus === "connected" ? "bg-emerald-500" : "bg-red-500 animate-pulse"
              }`}
              title={backendStatus === "connected" ? "Native engine connected" : "Connecting to engine..."}
            />
          </div>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          {/* Active Model & Server Quick Save */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setFileManagerMode("browse");
                setFileManagerOpen(true);
              }}
              className="flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800/80 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs transition group"
              title="Open Server File Browser"
            >
              <FolderOpen size={13} className="text-orange-400 group-hover:text-orange-300" />
              <span className="font-mono text-zinc-200 text-xs">{currentFilename}</span>
              {isAutoSaving ? (
                <span className="flex items-center gap-1 text-[10px] text-orange-400">
                  <Loader2 size={10} className="animate-spin" /> saving...
                </span>
              ) : isDirty ? (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> unsaved
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400/90">
                  <Check size={10} /> {lastSavedTime ? `saved ${lastSavedTime}` : "saved"}
                </span>
              )}
            </button>

            <button
              onClick={handleNewModel}
              className="flex items-center gap-1 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 text-zinc-300 px-2.5 py-1 rounded-lg text-xs font-medium transition"
              title="Clear editor and start a new model"
            >
              <FilePlus size={12} className="text-orange-400" />
              <span>New</span>
            </button>

            <button
              onClick={handleQuickSave}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                isDirty
                  ? "bg-amber-600/20 border-amber-500/50 text-amber-300 hover:bg-amber-600/30"
                  : "bg-zinc-800/80 border-zinc-700/80 text-zinc-300 hover:bg-zinc-700"
              }`}
              title="Save to server (Ctrl+S)"
            >
              <Save size={12} className={isDirty ? "text-amber-400" : "text-zinc-400"} />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Center / Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => executeRender(code)}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm disabled:opacity-50"
          >
            <Play size={13} className="fill-current" />
            Render (F5)
          </button>

          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer ml-1" title="Automatically re-renders 3D mesh when code changes">
            <input
              type="checkbox"
              checked={autoRender}
              onChange={(e) => setAutoRender(e.target.checked)}
              className="accent-orange-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span>Auto</span>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer ml-1" title="Automatically saves model to server after 2.5s of typing inactivity">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="accent-orange-500 w-3.5 h-3.5 rounded cursor-pointer"
            />
            <span>Auto-save</span>
          </label>
        </div>

        {/* Right Menu / Status & Exports */}
        <div className="flex items-center gap-3">
          {/* Export Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 transition">
              <Download size={13} />
              Export
              <ChevronDown size={12} className="text-zinc-400" />
            </button>
            <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 hidden group-hover:block z-50 text-xs">
              <button
                onClick={() => handleExport("stl")}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200"
              >
                STL Mesh (.stl)
              </button>
              <button
                onClick={() => handleExport("3mf")}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200"
              >
                3MF Package (.3mf)
              </button>
              <button
                onClick={() => handleExport("scad")}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200"
              >
                Source (.scad)
              </button>
              <button
                onClick={() => handleExport("png")}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200"
              >
                Snapshot (.png)
              </button>
              <div className="h-px bg-zinc-800 my-1" />
              <button
                onClick={() => {
                  setFileManagerMode("save_as");
                  setFileManagerOpen(true);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 flex items-center gap-1.5"
              >
                <Save size={12} className="text-orange-400" />
                Save As to Server...
              </button>
            </div>
          </div>

          {/* Server Models Browser Button */}
          <button
            onClick={() => {
              setFileManagerMode("browse");
              setFileManagerOpen(true);
            }}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 transition"
            title="Browse, open and manage models on server"
          >
            <FolderOpen size={13} className="text-orange-400" />
            <span>Models</span>
          </button>

          {/* Gemini API Key status button */}
          <button
            onClick={() => setApiKeyModalOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition ${
              hasApiKey
                ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
                : "bg-amber-950/40 border-amber-800 text-amber-400"
            }`}
          >
            <SettingsIcon size={13} />
            <span>{hasApiKey ? "Gemini Ready" : "Set Gemini Key"}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace (3-Column Layout with Resizable Panels) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Full-screen drag overlay to prevent pointer capture loss while dragging */}
        {(isDraggingLeft || isDraggingRight) && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}

        {/* Left Panel: Editor & Customizer */}
        <div
          style={{ width: `${editorWidth}px` }}
          className="shrink-0 flex flex-col bg-zinc-950 overflow-hidden"
        >
          {/* Tab Navigation */}
          <div className="h-9 border-b border-zinc-800 flex items-center px-2 gap-1 bg-zinc-900/60">
            <button
              onClick={() => setActiveTab("editor")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                activeTab === "editor"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Code size={13} />
              Code
            </button>
            <button
              onClick={() => setActiveTab("customizer")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                activeTab === "customizer"
                  ? "bg-zinc-800 text-cyan-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sliders size={13} />
              Customizer
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "editor" ? (
              <Editor
                code={code}
                onChange={handleCodeChange}
                onRun={() => executeRender(code)}
              />
            ) : (
              <Customizer code={code} onCodeChange={handleCodeChange} />
            )}
          </div>
        </div>

        {/* Left Resizer Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingLeft(true);
          }}
          className={`w-1.5 hover:w-2 transition-all cursor-col-resize z-20 select-none flex items-center justify-center relative group shrink-0 ${
            isDraggingLeft ? "bg-orange-500 w-2" : "bg-zinc-800 hover:bg-orange-500/80"
          }`}
          title="Drag to resize editor"
        >
          <div className="w-0.5 h-8 bg-zinc-600 group-hover:bg-white rounded-full transition-colors" />
        </div>

        {/* Center Panel: 3D Viewport & Collapsible Console */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-zinc-950 min-w-[200px]">
          <div className="flex-1 relative">
            <Viewport3D
              ref={viewportRef}
              stlData={stlData}
              isLoading={isLoading}
              renderTimeMs={renderTimeMs}
              engineName={backendVersion}
              errorMessage={lastCompilerError}
            />
          </div>

          {/* Bottom Console Drawer */}
          <div
            className={`border-t border-zinc-800 bg-zinc-900/95 transition-all duration-200 flex flex-col ${
              isConsoleOpen ? "h-40" : "h-7"
            }`}
          >
            <div
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              className="h-7 px-3 flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer bg-zinc-900 select-none border-b border-zinc-800/40"
            >
              <div className="flex items-center gap-2">
                <Terminal size={12} />
                <span className="font-mono text-[11px]">Console & Compiler Logs</span>
                {lastCompilerError && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
              <ChevronDown
                size={13}
                className={`transform transition-transform ${isConsoleOpen ? "rotate-180" : ""}`}
              />
            </div>
            {isConsoleOpen && (
              <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11px] text-zinc-300 whitespace-pre-wrap select-text bg-zinc-950">
                {consoleLogs || "No output."}
              </div>
            )}
          </div>
        </div>

        {/* Right Resizer Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingRight(true);
          }}
          className={`w-1.5 hover:w-2 transition-all cursor-col-resize z-20 select-none flex items-center justify-center relative group shrink-0 ${
            isDraggingRight ? "bg-orange-500 w-2" : "bg-zinc-800 hover:bg-orange-500/80"
          }`}
          title="Drag to resize AI chat"
        >
          <div className="w-0.5 h-8 bg-zinc-600 group-hover:bg-white rounded-full transition-colors" />
        </div>

        {/* Right Panel: Gemini CAD Copilot */}
        <div
          style={{ width: `${chatWidth}px` }}
          className="shrink-0 flex flex-col bg-zinc-900 overflow-hidden"
        >
          <ChatSidebar
            currentCode={code}
            onApplyCode={(newCode) => {
              setCode(newCode);
              executeRender(newCode);
            }}
            lastCompilerError={lastCompilerError}
            onRequestSnapshot={() => viewportRef.current?.getSnapshot() || null}
          />
        </div>
      </div>

      {/* API Key Modal */}
      {apiKeyModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <SettingsIcon size={16} className="text-orange-400" />
              Gemini API Key Configuration
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Enter your Google Gemini API key to enable AI pair programming, compiler error self-healing, and 3D visual inspections.
            </p>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-orange-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setApiKeyModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-1.5 rounded-lg text-xs bg-orange-600 hover:bg-orange-500 text-white font-medium transition"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Server File Manager Modal */}
      <FileManagerModal
        isOpen={fileManagerOpen}
        onClose={() => setFileManagerOpen(false)}
        currentFilename={currentFilename}
        currentCode={code}
        onOpenFile={handleOpenFile}
        onNewModel={handleNewModel}
        onSavedCurrentFile={(newFilename) => {
          setCurrentFilename(newFilename);
          setIsDirty(false);
          showToast(`Saved as models/${newFilename}`);
        }}
        initialMode={fileManagerMode}
      />

      {/* Floating Save/Status Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700/80 text-zinc-100 text-xs px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Check size={11} className="stroke-[3]" />
          </div>
          <span className="font-medium font-mono text-[11px]">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
