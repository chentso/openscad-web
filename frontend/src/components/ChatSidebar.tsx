import React, { useState, useRef, useEffect } from "react";
import {
  Send, Sparkles, Wrench, Eye, Check, AlertTriangle, ArrowRight, Bot, User, RefreshCw
} from "lucide-react";

interface Message {
  role: "user" | "model";
  content: string;
}

interface ChatSidebarProps {
  currentCode: string;
  onApplyCode: (newCode: string) => void;
  lastCompilerError?: string;
  onRequestSnapshot: () => string | null;
  theme?: "dark" | "light";
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  currentCode,
  onApplyCode,
  lastCompilerError,
  onRequestSnapshot,
  theme = "dark"
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      content: "Hello! I am your Gemini OpenSCAD AI pair programmer. Ask me to design a parametric model, add features, optimize CSG geometry, or auto-repair compiler errors."
    }
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash");
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Extract OpenSCAD code fence from response
  const extractCodeFromMarkdown = (text: string): string | null => {
    const match = text.match(/```(?:openscad|scad)?\n([\s\S]*?)```/i);
    return match ? match[1].trim() : null;
  };

  const handleSend = async (userPrompt: string = input) => {
    if (!userPrompt.trim() || isStreaming) return;

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: userPrompt }
    ];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          current_code: currentCode,
          chat_history: newMessages.slice(0, -1),
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      // Add placeholder model response
      setMessages((prev) => [...prev, { role: "model", content: "" }]);

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "model",
                    content: assistantText
                  };
                  return updated;
                });
              } else if (parsed.error) {
                assistantText += `\n[Error: ${parsed.error}]`;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "model",
                    content: assistantText
                  };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `⚠️ Error calling Gemini: ${err.message}` }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Trigger compiler error auto-fix loop
  const handleAutoFix = async () => {
    if (!lastCompilerError || isStreaming) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: `🔧 Auto-repair compilation error:\n\`\`\`\n${lastCompilerError}\n\`\`\`` }
    ]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/gemini/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_code: currentCode,
          compiler_errors: lastCompilerError,
          model: selectedModel
        })
      });

      if (!response.ok) throw new Error(await response.text());

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "model", content: "" }]);

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "model",
                    content: assistantText
                  };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `⚠️ Auto-fix error: ${err.message}` }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // Trigger Gemini Vision Review
  const handleVisionReview = async () => {
    if (isStreaming) return;
    const snapshot = onRequestSnapshot();
    if (!snapshot) {
      alert("Unable to capture 3D canvas snapshot.");
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "📸 [Attached 3D Render Snapshot] Please review my 3D geometry and suggest improvements." }
    ]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/gemini/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_code: currentCode,
          image_base64: snapshot,
          prompt: "Critique the geometry, proportions, and symmetry. Suggest improvements and updated OpenSCAD code.",
          model: selectedModel
        })
      });

      if (!response.ok) throw new Error(await response.text());

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "model", content: "" }]);

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "model",
                    content: assistantText
                  };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: `⚠️ Vision review error: ${err.message}` }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const isLight = theme === "light";

  return (
    <div className={`flex flex-col h-full border-l text-xs transition-colors ${
      isLight ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-zinc-900 border-zinc-800 text-zinc-200"
    }`}>
      {/* Header */}
      <div className={`p-3 border-b flex items-center justify-between transition-colors ${
        isLight ? "bg-white border-slate-200" : "bg-zinc-950/60 border-zinc-800"
      }`}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-500" />
          <span className={`font-semibold uppercase tracking-wider text-[11px] ${
            isLight ? "text-slate-900" : "text-zinc-100"
          }`}>
            Gemini CAD Copilot
          </span>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className={`border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-orange-500 font-mono transition-colors ${
            isLight
              ? "bg-slate-100 border-slate-300 text-slate-800"
              : "bg-zinc-800 border-zinc-700 text-zinc-300"
          }`}
        >
          <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
          <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
        </select>
      </div>

      {/* Compiler Error Quick-Fix Callout Banner */}
      {lastCompilerError && (
        <div className="bg-red-950/80 border-b border-red-800/80 p-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-red-300 truncate">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span className="truncate font-mono text-[11px]">Compiler error detected</span>
          </div>
          <button
            onClick={handleAutoFix}
            disabled={isStreaming}
            className="flex items-center gap-1 bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-[11px] font-medium transition disabled:opacity-50 shrink-0"
          >
            <Wrench size={12} />
            Auto-Fix
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3.5">
        {messages.map((msg, idx) => {
          const codeSnippet = msg.role === "model" ? extractCodeFromMarkdown(msg.content) : null;
          const isUser = msg.role === "user";

          return (
            <div
              key={idx}
              className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
            >
              <div className={`flex items-center gap-1 text-[10px] font-medium ${
                isLight ? "text-slate-500" : "text-zinc-400"
              }`}>
                {isUser ? (
                  <>
                    <span>You</span>
                    <User size={11} />
                  </>
                ) : (
                  <>
                    <Bot size={11} className="text-orange-500" />
                    <span className="text-orange-500">Gemini</span>
                  </>
                )}
              </div>

              <div
                className={`p-3 rounded-xl max-w-[95%] leading-relaxed ${
                  isUser
                    ? "bg-orange-600 text-white shadow-xs"
                    : isLight
                    ? "bg-white text-slate-800 border border-slate-200/90 shadow-xs"
                    : "bg-zinc-800/90 text-zinc-200 border border-zinc-700/60"
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                {/* 1-Click Apply Code Button */}
                {codeSnippet && (
                  <div className={`mt-3 pt-2.5 border-t flex items-center justify-between gap-2 ${
                    isLight ? "border-slate-200" : "border-zinc-700/80"
                  }`}>
                    <span className={`text-[10px] font-mono ${isLight ? "text-slate-500" : "text-zinc-400"}`}>
                      OpenSCAD Code Block Ready
                    </span>
                    <button
                      onClick={() => {
                        onApplyCode(codeSnippet);
                        setAppliedIndex(idx);
                        setTimeout(() => setAppliedIndex(null), 2500);
                      }}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-md text-[11px] font-medium transition shadow-sm"
                    >
                      {appliedIndex === idx ? (
                        <>
                          <Check size={12} /> Applied!
                        </>
                      ) : (
                        <>
                          <ArrowRight size={12} /> Apply to Editor
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isStreaming && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs italic">
            <RefreshCw size={12} className="animate-spin text-orange-500" />
            Gemini is reasoning and writing code...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Pills */}
      <div className={`px-3 py-1.5 border-t flex gap-1.5 overflow-x-auto no-scrollbar transition-colors ${
        isLight ? "border-slate-200 bg-slate-100/60" : "border-zinc-800 bg-zinc-950/40"
      }`}>
        <button
          onClick={() => handleSend("Create a parametric box with sliding lid and screw holes")}
          className={`whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] transition border ${
            isLight
              ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
          }`}
        >
          📦 Parametric Enclosure
        </button>
        <button
          onClick={handleVisionReview}
          className={`whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] transition border flex items-center gap-1 ${
            isLight
              ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
          }`}
        >
          <Eye size={10} /> 3D Vision Review
        </button>
        <button
          onClick={() => handleSend("Add rounded chamfers and fillets to the edges")}
          className={`whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] transition border ${
            isLight
              ? "bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs"
              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
          }`}
        >
          ✨ Add Chamfers
        </button>
      </div>

      {/* Prompt Input Box */}
      <div className={`p-3 border-t transition-colors ${
        isLight ? "border-slate-200 bg-white" : "border-zinc-800 bg-zinc-950"
      }`}>
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Gemini to edit code or build a new model... (Shift+Enter for newline)"
            rows={2}
            className={`w-full border rounded-lg pl-3 pr-10 py-2 resize-none font-sans text-xs focus:outline-none focus:border-orange-500 transition-colors ${
              isLight
                ? "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400"
                : "bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-500"
            }`}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className="absolute right-2.5 p-1.5 rounded-md bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:hover:bg-orange-600 transition"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
