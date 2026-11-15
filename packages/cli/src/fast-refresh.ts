import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { Plugin } from "esbuild";

type BabelApi = {
  transformAsync(
    source: string,
    options: Record<string, unknown>
  ): Promise<{ code?: string | null; map?: unknown } | null>;
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
      build.onLoad({ filter: /\\.[jt]sx?$/ }, async (args) => {
        const file = resolve(args.path);
        if (!file.startsWith(root + sep) || file.includes(sep + "node_modules" + sep)) return null;

        const source = await readFile(file, "utf8");
        const isTsx = /\\.(?:tsx|jsx)$/.test(file);
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
        ].join("\\n");

        return {
          contents,
          loader: "js",
          resolveDir: dirname(file),
          watchFiles: [file]
        };
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
      build.onResolve({ filter: /^react-dom\\/client$/ }, () => ({
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

export const FAST_REFRESH_BANNER = `import RefreshRuntime from "react-refresh/runtime";
RefreshRuntime.injectIntoGlobalHook(window);
window.__JAVAFY_REFRESH_RUNTIME__ = RefreshRuntime;
window.__JAVAFY_REFRESH_MODULE__ = "";
window.$RefreshReg$ = (type, id) => RefreshRuntime.register(type, window.__JAVAFY_REFRESH_MODULE__ + " " + id);
window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;`;

export const FAST_REFRESH_FOOTER = `if (window.__JAVAFY_REFRESH_RUNTIME__) window.__JAVAFY_REFRESH_RUNTIME__.performReactRefresh();`;
