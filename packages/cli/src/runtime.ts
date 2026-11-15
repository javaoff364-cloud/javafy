import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { Metafile, Message, Plugin } from "esbuild";

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
      .map((item) => item.path.split(sep).join("/"));
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
  events.addEventListener("hmr", async () => {
    try {
      await import("/@javafy/app.js?t=" + Date.now());
    } catch (error) {
      showErrors([{ text: "Javafy could not apply the update: " + (error instanceof Error ? error.message : String(error)) }]);
    }
  });
  events.addEventListener("reload", () => location.reload());
})();`;
}


type BabelApi = {
  transformAsync(source: string, options: Record<string, unknown>): Promise<{ code?: string | null } | null>;
};

export function createFastRefreshPlugin(root: string): Plugin {
  const require = createRequire(resolve(root, "package.json"));
  const babel = require("@babel/core") as BabelApi;
  const presetReact = require("@babel/preset-react");
  const presetTypescript = require("@babel/preset-typescript");
  const refreshPlugin = require("react-refresh/babel");

  return {
    name: "javafy-react-fast-refresh",
    setup(build) {
      build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
        const file = resolve(args.path);
        if (!file.startsWith(root + sep) || file.includes(sep + "node_modules" + sep)) return null;
        const source = await readFile(file, "utf8");
        const isTsx = /\.(?:tsx|jsx)$/.test(file);
        const transformed = await babel.transformAsync(source, {
          filename: file,
          sourceType: "module",
          sourceMaps: true,
          configFile: false,
          babelrc: false,
          presets: [
            [presetTypescript, { allExtensions: true, isTSX: isTsx }],
            [presetReact, { runtime: "automatic", development: true }]
          ],
          plugins: [refreshPlugin]
        });
        if (!transformed?.code) {
          return { errors: [{ text: "Javafy Fast Refresh could not transform " + relative(root, file) }] };
        }
        const moduleId = relative(root, file).split(sep).join("/");
        const contents = [
          "const __javafyPreviousRefreshModule = window.__JAVAFY_REFRESH_MODULE__;",
          "window.__JAVAFY_REFRESH_MODULE__ = " + JSON.stringify(moduleId) + ";",
          transformed.code,
          "window.__JAVAFY_REFRESH_MODULE__ = __javafyPreviousRefreshModule;"
        ].join("\n");
        return { contents, loader: "js", resolveDir: dirname(file), watchFiles: [file] };
      });
    }
  };
}

export function createReactDomClientPlugin(root: string): Plugin {
  const projectRequire = createRequire(resolve(root, "package.json"));
  const reactDomClientPath = projectRequire.resolve("react-dom/client");
  return {
    name: "javafy-react-root-persistence",
    setup(build) {
      build.onResolve({ filter: /^react-dom\/client$/ }, () => ({
        path: "react-dom-client",
        namespace: "javafy-react-dom"
      }));
      build.onLoad({ filter: /.*/, namespace: "javafy-react-dom" }, () => ({
        loader: "js",
        resolveDir: root,
        contents: `
          import { createRoot as createBaseRoot, hydrateRoot as hydrateBaseRoot, version } from ${JSON.stringify(reactDomClientPath)};
          const roots = () => window.__JAVAFY_REACT_ROOTS__ || (window.__JAVAFY_REACT_ROOTS__ = new WeakMap());
          export { version };
          export function createRoot(container, options) {
            const existing = roots().get(container);
            if (existing) return existing;
            const root = createBaseRoot(container, options);
            roots().set(container, root);
            return root;
          }
          export function hydrateRoot(container, children, options) {
            const existing = roots().get(container);
            if (existing) {
              existing.render(children);
              return existing;
            }
            const root = hydrateBaseRoot(container, children, options);
            roots().set(container, root);
            return root;
          }
        `
      }));
    }
  };
}

export const FAST_REFRESH_PREAMBLE = `import RefreshRuntime from "/@javafy/react-refresh.js";
RefreshRuntime.injectIntoGlobalHook(window);
window.__JAVAFY_REFRESH_RUNTIME__ = RefreshRuntime;
window.__JAVAFY_REFRESH_MODULE__ = "";
window.$RefreshReg$ = (type, id) => RefreshRuntime.register(type, window.__JAVAFY_REFRESH_MODULE__ + " " + id);
window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;`;

export const FAST_REFRESH_FOOTER = `if (window.__JAVAFY_REFRESH_RUNTIME__) window.__JAVAFY_REFRESH_RUNTIME__.performReactRefresh();`;
