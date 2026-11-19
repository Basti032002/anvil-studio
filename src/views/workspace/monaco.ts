// Monaco (der Editor aus VS Code) – komplett mitgeliefert, funktioniert offline.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution";
import "monaco-editor/esm/vs/basic-languages/ini/ini.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController";
import "monaco-editor/esm/vs/editor/contrib/folding/browser/folding";
import "monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching";
import "monaco-editor/esm/vs/editor/contrib/comment/browser/comment";
import "monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === "json" ? new JsonWorker() : new EditorWorker();
  },
};

monaco.editor.defineTheme("anvil-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "c792ea" },
    { token: "string", foreground: "a5d6a7" },
    { token: "number", foreground: "f2b54a" },
    { token: "comment", foreground: "6b737e", fontStyle: "italic" },
    { token: "type", foreground: "8ab4f8" },
    { token: "annotation", foreground: "7bd05a" },
  ],
  colors: {
    "editor.background": "#0b0c0f",
    "editor.lineHighlightBackground": "#14161b",
    "editorLineNumber.foreground": "#3a3f49",
    "editorLineNumber.activeForeground": "#8b929c",
    "editor.selectionBackground": "#7bd05a33",
    "editorCursor.foreground": "#7bd05a",
    "editorIndentGuide.background1": "#1a1d23",
    "editorWidget.background": "#16181d",
    "editorWidget.border": "#30343c",
  },
});

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "java") return "java";
  if (ext === "json" || ext === "mcmeta") return "json";
  if (ext === "properties" || ext === "toml" || ext === "cfg") return "ini";
  if (ext === "md") return "markdown";
  return "plaintext";
}

export default monaco;
