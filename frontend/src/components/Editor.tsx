import { useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";

interface EditorProps {
  code: string;
  onChange: (value: string) => void;
  onRun?: () => void;
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, onRun }) => {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Register OpenSCAD language if not already registered
    if (!monaco.languages.getLanguages().some((l: any) => l.id === "openscad")) {
      monaco.languages.register({ id: "openscad" });

      monaco.languages.setMonarchTokensProvider("openscad", {
        keywords: [
          "module", "function", "if", "else", "for", "intersection_for",
          "let", "each", "true", "false", "undef", "include", "use"
        ],
        builtins: [
          "cube", "sphere", "cylinder", "polyhedron", "circle", "square",
          "polygon", "text", "union", "difference", "intersection", "render",
          "translate", "rotate", "scale", "resize", "mirror", "multmatrix",
          "color", "offset", "hull", "minkowski", "linear_extrude",
          "rotate_extrude", "projection", "surface", "import", "version",
          "parent_module", "echo", "assert"
        ],
        specialVars: [
          "$fn", "$fa", "$fs", "$t", "$vpr", "$vpt", "$vpd", "$children", "$preview"
        ],
        operators: [
          "=", ">", "<", "!", "~", "?", ":", "==", "<=", ">=", "!=",
          "&&", "||", "++", "--", "+", "-", "*", "/", "%"
        ],
        tokenizer: {
          root: [
            // Customizer annotations
            [/\/\*.*?\*\//, "comment"],
            [/\/\/.*$/, "comment"],
            // Special vars
            [/\$[a-zA-Z0-9_]+/, "variable.predefined"],
            // Keywords & builtins
            [
              /[a-zA-Z_]\w*/,
              {
                cases: {
                  "@keywords": "keyword",
                  "@builtins": "type.identifier",
                  "@default": "identifier"
                }
              }
            ],
            // Numbers
            [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
            [/\d+/, "number"],
            // Strings
            [/"([^"\\]|\\.)*"/, "string"],
            // Delimiters
            [/[{}()\[\]]/, "@brackets"],
            [/[,;]/, "delimiter"]
          ]
        }
      });

      monaco.languages.setLanguageConfiguration("openscad", {
        comments: {
          lineComment: "//",
          blockComment: ["/*", "*/"]
        },
        brackets: [
          ["{", "}"],
          ["[", "]"],
          ["(", ")"]
        ],
        autoClosingPairs: [
          { open: "{", close: "}" },
          { open: "[", close: "]" },
          { open: "(", close: ")" },
          { open: '"', close: '"' }
        ]
      });

      monaco.editor.defineTheme("openscad-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "keyword", foreground: "f43f5e", fontStyle: "bold" },
          { token: "type.identifier", foreground: "38bdf8" },
          { token: "variable.predefined", foreground: "fbbf24", fontStyle: "bold" },
          { token: "comment", foreground: "71717a", fontStyle: "italic" },
          { token: "string", foreground: "34d399" },
          { token: "number", foreground: "a78bfa" }
        ],
        colors: {
          "editor.background": "#09090b",
          "editor.lineHighlightBackground": "#18181b",
          "editorLineNumber.foreground": "#52525b",
          "editorLineNumber.activeForeground": "#a1a1aa",
          "editorIndentGuide.background": "#27272a",
          "editorIndentGuide.activeBackground": "#3f3f46"
        }
      });
    }

    monaco.editor.setTheme("openscad-dark");

    // Add keyboard shortcut (F5 or Ctrl+Enter to trigger re-render)
    editor.addCommand(monaco.KeyCode.F5, () => {
      onRun?.();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRun?.();
    });
  };

  return (
    <div className="w-full h-full overflow-hidden bg-zinc-950">
      <MonacoEditor
        language="openscad"
        value={code}
        onChange={(val) => onChange(val || "")}
        onMount={handleEditorDidMount}
        theme="openscad-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          fontLigatures: true,
          lineNumbers: "on",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on"
        }}
      />
    </div>
  );
};
