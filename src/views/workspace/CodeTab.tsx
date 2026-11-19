import { useEffect, useRef, useState } from "react";
import { FileEntry, filesApi, Project } from "../../api";
import { ChevronIcon, CloseIcon, FolderIcon, PlusIcon } from "../../icons";
import { toast, useSettings } from "../../state";
import monaco, { languageFor } from "./monaco";

type OpenFile = { rel: string; model: monaco.editor.ITextModel; saved: number; version: number };

export default function CodeTab({ project }: { project: Project }) {
  const settings = useSettings();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor>();
  const [files, setFiles] = useState<OpenFile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Editor einmal anlegen
  useEffect(() => {
    if (!host.current) return;
    editor.current = monaco.editor.create(host.current, {
      theme: "anvil-dark",
      automaticLayout: true,
      fontFamily: "JetBrains Mono, Consolas, monospace",
      fontSize: (settings?.consoleFontSize ?? 12) + 1,
      minimap: { enabled: false },
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on",
      cursorBlinking: "smooth",
      scrollBeyondLastLine: false,
      renderLineHighlight: "all",
      padding: { top: 10 },
      tabSize: 4,
    });
    const sub = editor.current.onDidChangeModelContent(() => {
      const m = editor.current?.getModel();
      setFiles((list) => list.map((f) => (f.model === m ? { ...f, version: m!.getAlternativeVersionId() } : f)));
    });
    editor.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveActive());
    return () => {
      sub.dispose();
      editor.current?.dispose();
      filesRef.current.forEach((f) => f.model.dispose());
    };
  }, []);

  async function open(rel: string) {
    const existing = filesRef.current.find((f) => f.rel === rel);
    if (existing) {
      editor.current?.setModel(existing.model);
      setActive(rel);
      return;
    }
    try {
      const text = await filesApi.read(project.id, rel);
      const uri = monaco.Uri.parse(`anvil://${project.id}/${rel}`);
      const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(text, languageFor(rel), uri);
      const v = model.getAlternativeVersionId();
      setFiles((list) => [...list, { rel, model, saved: v, version: v }]);
      editor.current?.setModel(model);
      setActive(rel);
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function saveActive() {
    const m = editor.current?.getModel();
    const f = filesRef.current.find((x) => x.model === m);
    if (!f) return;
    try {
      await filesApi.write(project.id, f.rel, f.model.getValue());
      const v = f.model.getAlternativeVersionId();
      setFiles((list) => list.map((x) => (x.rel === f.rel ? { ...x, saved: v, version: v } : x)));
      toast(`${f.rel.split("/").pop()} gespeichert.`, "success", 1800);
    } catch (e) {
      toast(String(e), "error");
    }
  }

  function close(rel: string) {
    const f = filesRef.current.find((x) => x.rel === rel);
    if (!f) return;
    if (f.version !== f.saved && !confirm(`${rel} hat ungespeicherte Änderungen. Trotzdem schließen?`)) return;
    const rest = filesRef.current.filter((x) => x.rel !== rel);
    setFiles(rest);
    if (active === rel) {
      const next = rest[rest.length - 1];
      editor.current?.setModel(next?.model ?? null);
      setActive(next?.rel ?? null);
    }
    f.model.dispose();
  }

  return (
    <div className="code">
      <aside className="file-tree">
        <div className="content-list-head">
          <span>Dateien</span>
          <button
            className="icon-btn"
            aria-label="Neue Datei"
            data-tip="Neue Datei"
            onClick={async () => {
              const rel = prompt("Pfad der neuen Datei (relativ zum Projekt):", `src/main/java/${project.package.replace(/\./g, "/")}/NeueKlasse.java`);
              if (!rel) return;
              try {
                await filesApi.create(project.id, rel.trim(), false);
                window.dispatchEvent(new Event("anvil:tree-refresh"));
                open(rel.trim());
              } catch (e) {
                toast(String(e), "error");
              }
            }}
          >
            <PlusIcon size={15} />
          </button>
        </div>
        <Tree projectId={project.id} rel="" depth={0} onOpen={open} active={active} initiallyOpen={["src", "src/main", "src/main/java"]} />
      </aside>
      <section className="code-main">
        <div className="code-tabs">
          {files.map((f) => (
            <div key={f.rel} className={f.rel === active ? "code-tab active" : "code-tab"}>
              <button className="code-tab-name" onClick={() => open(f.rel)} title={f.rel}>
                {f.rel.split("/").pop()}
                {f.version !== f.saved && <span className="dirty-dot" aria-label="ungespeichert" />}
              </button>
              <button className="code-tab-close" aria-label={`${f.rel} schließen`} onClick={() => close(f.rel)}>
                <CloseIcon size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="code-editor" ref={host} />
        {!active && (
          <div className="code-empty">
            <p className="muted">Wähle links eine Datei. Speichern mit <kbd>Strg S</kbd>.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Tree({
  projectId,
  rel,
  depth,
  onOpen,
  active,
  initiallyOpen,
}: {
  projectId: string;
  rel: string;
  depth: number;
  onOpen: (rel: string) => void;
  active: string | null;
  initiallyOpen: string[];
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(initiallyOpen.map((p) => [p, true])));

  useEffect(() => {
    const load = () => filesApi.list(projectId, rel).then(setEntries).catch(() => setEntries([]));
    load();
    window.addEventListener("anvil:tree-refresh", load);
    return () => window.removeEventListener("anvil:tree-refresh", load);
  }, [projectId, rel]);

  if (!entries) return null;
  return (
    <ul className="tree-list">
      {entries.map((e) => (
        <li key={e.rel}>
          <button
            className={e.rel === active ? "tree-item active" : "tree-item"}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => (e.isDir ? setOpen((o) => ({ ...o, [e.rel]: !o[e.rel] })) : onOpen(e.rel))}
          >
            {e.isDir ? (
              <span className={open[e.rel] ? "tree-chev open" : "tree-chev"}>
                <ChevronIcon size={11} />
              </span>
            ) : (
              <span className={`file-dot ${e.name.split(".").pop()}`} />
            )}
            {e.isDir && <FolderIcon size={13} />}
            <span className="tree-name">{e.name}</span>
          </button>
          {e.isDir && open[e.rel] && <Tree projectId={projectId} rel={e.rel} depth={depth + 1} onOpen={onOpen} active={active} initiallyOpen={initiallyOpen} />}
        </li>
      ))}
    </ul>
  );
}
