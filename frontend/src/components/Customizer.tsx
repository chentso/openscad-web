import React from "react";
import { Sliders } from "lucide-react";

export interface ParameterDef {
  name: string;
  value: number | string | boolean;
  type: "number" | "boolean" | "string" | "enum";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  comment?: string;
}

interface CustomizerProps {
  code: string;
  onCodeChange: (newCode: string) => void;
}

export const Customizer: React.FC<CustomizerProps> = ({ code, onCodeChange }) => {
  // Parse parameters from code
  const parseParameters = (): ParameterDef[] => {
    const params: ParameterDef[] = [];
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Stop parsing once we hit module definitions or CSG operations
      if (line.startsWith("module ") || line.startsWith("function ") || line.startsWith("difference()") || line.startsWith("union()")) {
        break;
      }

      // Match variable declarations: var_name = value; // [comment/ranges]
      const match = line.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);(?:\s*\/\/\s*(.*))?$/);
      if (match) {
        const name = match[1];
        const rawVal = match[2].trim();
        const comment = match[3] ? match[3].trim() : "";

        // Boolean
        if (rawVal === "true" || rawVal === "false") {
          params.push({
            name,
            value: rawVal === "true",
            type: "boolean",
            comment
          });
          continue;
        }

        // String
        if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
          params.push({
            name,
            value: rawVal.slice(1, -1),
            type: "string",
            comment
          });
          continue;
        }

        // Number
        const numVal = parseFloat(rawVal);
        if (!isNaN(numVal)) {
          let min = 0;
          let max = Math.max(numVal * 2, 100);
          let step = 1;

          // Check if comment contains range [min:max] or [min:step:max]
          const rangeMatch = comment.match(/\[([0-9.]+):(?:([0-9.]+):)?([0-9.]+)\]/);
          if (rangeMatch) {
            min = parseFloat(rangeMatch[1]);
            if (rangeMatch[2]) {
              step = parseFloat(rangeMatch[2]);
              max = parseFloat(rangeMatch[3]);
            } else {
              max = parseFloat(rangeMatch[3]);
            }
          }

          params.push({
            name,
            value: numVal,
            type: "number",
            min,
            max,
            step,
            comment
          });
        }
      }
    }

    return params;
  };

  const params = parseParameters();

  const handleUpdate = (paramName: string, newValue: number | string | boolean) => {
    const formattedVal =
      typeof newValue === "string" ? `"${newValue}"` : String(newValue);

    const regex = new RegExp(`^(\\s*${paramName}\\s*=\\s*)[^;]+(;.*)$`, "m");
    const updated = code.replace(regex, `$1${formattedVal}$2`);
    onCodeChange(updated);
  };

  if (params.length === 0) {
    return (
      <div className="p-6 text-center text-zinc-500 text-xs flex flex-col items-center justify-center h-full">
        <Sliders className="w-8 h-8 mb-2 stroke-1 text-zinc-600" />
        <p className="font-medium text-zinc-400">No Customizer Parameters Detected</p>
        <p className="mt-1 max-w-xs leading-relaxed">
          Declare top-level variables with range comments, e.g.:
        </p>
        <pre className="mt-2 bg-zinc-900 border border-zinc-800 p-2 rounded text-zinc-300 font-mono text-[11px] text-left">
          {`width = 50; // [20:100]\nheight = 25; // [10:0.5:60]\nchamfer = true;`}
        </pre>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full text-zinc-200 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">
          Model Parameters ({params.length})
        </span>
      </div>

      {params.map((p) => (
        <div key={p.name} className="space-y-1.5 bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between">
            <label className="font-mono font-medium text-cyan-400">{p.name}</label>
            <span className="font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">
              {String(p.value)}
            </span>
          </div>

          {p.type === "number" && (
            <div className="space-y-1">
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={p.value as number}
                onChange={(e) => handleUpdate(p.name, parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-1.5 bg-zinc-700 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>{p.min}</span>
                <span>{p.max}</span>
              </div>
            </div>
          )}

          {p.type === "boolean" && (
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={p.value as boolean}
                onChange={(e) => handleUpdate(p.name, e.target.checked)}
                className="accent-orange-500 w-4 h-4 rounded cursor-pointer"
              />
              <span className="text-zinc-300">Enable feature</span>
            </label>
          )}

          {p.type === "string" && (
            <input
              type="text"
              value={p.value as string}
              onChange={(e) => handleUpdate(p.name, e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 font-mono"
            />
          )}

          {p.comment && (
            <p className="text-[10px] text-zinc-500 italic">{p.comment}</p>
          )}
        </div>
      ))}
    </div>
  );
};
