import { useState, useEffect, useRef } from "react";
import {
  X, FolderOpen, FileCode, Plus, Upload, Trash2, Edit3,
  Check, Search, HardDrive, Download, AlertCircle, Loader2
} from "lucide-react";

export interface ServerFile {
  name: string;
  size: number;
  size_formatted: string;
  modified_timestamp: number;
  modified_formatted: string;
}

interface FileManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilename: string;
  currentCode: string;
  onOpenFile: (filename: string, content: string) => void;
  onSavedCurrentFile: (filename: string) => void;
  onNewModel?: () => void;
  initialMode?: "browse" | "save_as";
}

export const FileManagerModal: React.FC<FileManagerModalProps> = ({
  isOpen,
  onClose,
  currentFilename,
  currentCode,
  onOpenFile,
  onSavedCurrentFile,
  onNewModel,
  initialMode = "browse"
}) => {
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modes: "browse" or "save_as"
  const [mode, setMode] = useState<"browse" | "save_as">(initialMode);
  const [saveAsInput, setSaveAsInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Rename state
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch files list from server
  const fetchFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files/");
      if (!res.ok) throw new Error(await res.text());
      const data: ServerFile[] = await res.json();
      setFiles(data);
    } catch (err: any) {
      setError(err.message || "Failed to load files from server");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setSaveAsInput(currentFilename || "my_model.scad");
      setError(null);
      fetchFiles();
    }
  }, [isOpen, initialMode, currentFilename]);

  if (!isOpen) return null;

  // Filter files
  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Open a file
  const handleOpen = async (filename: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onOpenFile(data.name, data.content);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to open file");
    } finally {
      setIsLoading(false);
    }
  };

  // Save current code to server with a new name
  const handleSaveAs = async () => {
    let cleanName = saveAsInput.trim();
    if (!cleanName) return;
    if (!cleanName.endsWith(".scad")) cleanName += ".scad";

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/files/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: cleanName,
          content: currentCode
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onSavedCurrentFile(data.name);
      await fetchFiles();
      setMode("browse");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save file to server");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete a file
  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete '${filename}' from the server?`)) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchFiles();
    } catch (err: any) {
      setError(err.message || "Failed to delete file");
    }
  };

  // Start rename
  const handleStartRename = (filename: string) => {
    setRenamingFile(filename);
    setRenameInput(filename.replace(/\.scad$/, ""));
  };

  // Submit rename
  const handleConfirmRename = async (oldName: string) => {
    let newName = renameInput.trim();
    if (!newName) return;
    if (!newName.endsWith(".scad")) newName += ".scad";

    if (oldName === newName) {
      setRenamingFile(null);
      return;
    }

    try {
      const res = await fetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_filename: oldName,
          new_filename: newName
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (currentFilename === oldName) {
        onSavedCurrentFile(data.new_name);
      }
      setRenamingFile(null);
      await fetchFiles();
    } catch (err: any) {
      setError(err.message || "Failed to rename file");
    }
  };

  // Upload .scad file from computer to server
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    try {
      setIsLoading(true);
      setError(null);
      const text = await uploadedFile.text();
      const res = await fetch("/api/files/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: uploadedFile.name,
          content: text
        })
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchFiles();
    } catch (err: any) {
      setError(err.message || "Failed to upload file");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Download copy to computer
  const handleDownloadCopy = async (filename: string) => {
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const blob = new Blob([data.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Failed to download file");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] text-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-inner">
              <HardDrive size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                Server Models
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700 font-mono">
                  models/
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                OpenSCAD projects stored directly on the server filesystem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-3 bg-red-950/40 border border-red-800/80 rounded-lg p-2.5 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Save As Mode View */}
        {mode === "save_as" ? (
          <div className="py-6 space-y-4">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
              <label className="block text-xs font-medium text-zinc-300">
                Save Current Model to Server
              </label>
              <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 focus-within:border-orange-500">
                <FileCode size={16} className="text-orange-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={saveAsInput}
                  onChange={(e) => setSaveAsInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveAs()}
                  placeholder="model_name.scad"
                  autoFocus
                  className="bg-transparent text-zinc-100 font-mono text-xs w-full outline-none"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                Will be saved as <span className="font-mono text-zinc-300">models/{saveAsInput.endsWith(".scad") ? saveAsInput : `${saveAsInput}.scad`}</span>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode("browse")}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg text-xs font-medium transition"
              >
                Back to Files
              </button>
              <button
                type="button"
                onClick={handleSaveAs}
                disabled={isSaving || !saveAsInput.trim()}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow transition"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Save to Server
              </button>
            </div>
          </div>
        ) : (
          /* Browse Files Mode */
          <div className="flex-1 flex flex-col min-h-0 pt-4 space-y-3">
            {/* Action Bar */}
            <div className="flex items-center justify-between gap-2">
              {/* Search input */}
              <div className="flex-1 flex items-center bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 focus-within:border-orange-500 text-xs">
                <Search size={13} className="text-zinc-500 mr-2 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  className="bg-transparent text-zinc-200 outline-none w-full text-xs"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-zinc-500 hover:text-zinc-300">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* New Blank Model Button */}
              {onNewModel && (
                <button
                  type="button"
                  onClick={() => {
                    onNewModel();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm shrink-0"
                  title="Clear editor and start a new model"
                >
                  <Plus size={13} className="text-orange-400" />
                  New Model
                </button>
              )}

              {/* Save As Button */}
              <button
                type="button"
                onClick={() => setMode("save_as")}
                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm shrink-0"
              >
                Save Current As...
              </button>

              {/* Upload .scad file */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".scad"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
                title="Upload a .scad file from your computer"
              >
                <Upload size={13} />
                Upload .scad
              </button>
            </div>

            {/* Files List */}
            <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950 divide-y divide-zinc-800/60 min-h-[240px]">
              {isLoading && files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-500 space-y-2">
                  <Loader2 size={24} className="animate-spin text-orange-500" />
                  <span className="text-xs">Loading models from server...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-500 space-y-2">
                  <FolderOpen size={30} className="text-zinc-600" />
                  <span className="text-xs">
                    {searchQuery ? "No matching models found" : "No models on server yet"}
                  </span>
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const isCurrent = file.name === currentFilename;
                  const isRenaming = renamingFile === file.name;

                  return (
                    <div
                      key={file.name}
                      className={`flex items-center justify-between p-3 transition hover:bg-zinc-900/80 ${
                        isCurrent ? "bg-orange-500/5" : ""
                      }`}
                    >
                      {/* Left: Icon & Name */}
                      <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isCurrent
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          <FileCode size={16} />
                        </div>

                        {isRenaming ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              type="text"
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleConfirmRename(file.name);
                                if (e.key === "Escape") setRenamingFile(null);
                              }}
                              autoFocus
                              className="bg-zinc-900 border border-orange-500 rounded px-2 py-1 text-xs font-mono text-zinc-100 outline-none flex-1"
                            />
                            <span className="text-zinc-500 font-mono text-xs">.scad</span>
                            <button
                              onClick={() => handleConfirmRename(file.name)}
                              className="p-1 hover:bg-zinc-800 rounded text-emerald-400"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setRenamingFile(null)}
                              className="p-1 hover:bg-zinc-800 rounded text-zinc-400"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                onClick={() => handleOpen(file.name)}
                                className="font-mono text-xs font-medium text-zinc-200 hover:text-orange-400 cursor-pointer truncate"
                                title="Click to open"
                              >
                                {file.name}
                              </span>
                              {isCurrent && (
                                <span className="bg-orange-500/20 text-orange-400 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-orange-500/30 shrink-0">
                                  Current
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-3 mt-0.5">
                              <span>{file.size_formatted}</span>
                              <span>•</span>
                              <span>{file.modified_formatted}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpen(file.name)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1"
                        >
                          <FolderOpen size={12} />
                          Open
                        </button>
                        <button
                          onClick={() => handleDownloadCopy(file.name)}
                          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-md transition"
                          title="Download a copy"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          onClick={() => handleStartRename(file.name)}
                          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-md transition"
                          title="Rename file"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(file.name)}
                          className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-red-400 rounded-md transition"
                          title="Delete file"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer summary */}
            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
              <span>{files.length} model{files.length === 1 ? "" : "s"} on server</span>
              <span>Saved in <code className="text-zinc-400">./models/</code></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
