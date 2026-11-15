import { relative, resolve, sep } from "node:path";
import type { Metafile, Message } from "esbuild";

export interface JavafyModuleGraphEntry {
  id: string;
  imports: string[];
}

export interface JavafyModuleGraph {
  modules: JavafyModuleGraphEntry[];
}

export function createModuleGraph(
  metafile: Metafile | undefined,
  root: string
): JavafyModuleGraph {
  if (!metafile) return { modules: [] };
  const ids = new Set(Object.keys(metafile.inputs));
  const modules = Object.entries(metafile.inputs).map(([input, info]) => {
    const absolute = resolve(root, input);
    const id = relative(root, absolute).split(sep).join("/");
    const imports = info.imports
      .filter((item) => !item.external && ids.has(item.path))
      .map((item) => relative(root, resolve(root, item.path)).split(sep).join("/"));
    return { id, imports };
  });
  modules.sort((a, b) => a.id.localeCompare(b.id));
  return { modules };
}

export function serializeBuildErrors(errors: Message[]): string {
  return JSON.stringify(errors.map((error) => ({
    text: error.text,
    ...(error.location ? {
      file: error.location.file,
      line: error.location.line,
      column: error.location.column
    } : {})
  }))).replace(/</g, "\\u003c");
}

export function createDevClientScript(): string {
  return String.raw`(() => {
  if (window.__JAVAFY_DEV_CLIENT__) return;
  window.__JAVAFY_DEV_CLIENT__ = true;
  let overlay;
  const removeOverlay = () => {
    overlay?.remove();
    overlay = undefined;
  };
  const showErrors = (errors) => {
    removeOverlay();
    overlay = document.createElement("div");
    overlay.id = "javafy-error-overlay";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "2147483647",
      overflow: "auto", padding: "28px", background: "rgba(12, 15, 24, .97)",
      color: "#f8fafc", font: "14px/1.6 ui-monospace, SFMono-Regular, monospace",
      whiteSpace: "pre-wrap"
    });
    const heading = document.createElement("h2");
    heading.textContent = "Javafy — Compilation error";
    heading.style.color = "#f87171";
    overlay.append(heading);
    for (const error of errors) {
      const item = document.createElement("pre");
      item.textContent = [
        error.file ? error.file + (error.line ? ":" + error.line + ":" + (error.column ?? 0) : "") : "",
        error.text
      ].filter(Boolean).join("\n");
      item.style.whiteSpace = "pre-wrap";
      overlay.append(item);
    }
    const hint = document.createElement("p");
    hint.textContent = "Fix the error and save the file to continue.";
    hint.style.color = "#cbd5e1";
    overlay.append(hint);
    document.body.append(overlay);
  };
  const events = new EventSource("/__javafy/events");
  events.addEventListener("build-error", (event) => {
    try { showErrors(JSON.parse(event.data)); }
    catch { showErrors([{ text: "Javafy could not parse the build error response." }]); }
  });
  events.addEventListener("build-success", removeOverlay);
  events.addEventListener("reload", () => location.reload());
})();`;
}
