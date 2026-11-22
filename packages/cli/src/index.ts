#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync,
  watch, writeFileSync
} from "node:fs";
import { basename, dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createApiRouter, createMiddlewareHandler } from "@javafy/server";
import { buildFullstackManifest, discoverFullstackFiles, getStaticRoutePaths, loadFullstackManifest, renderFullstackPage } from "./fullstack.js";
import {
  build as esbuild, context as createBuildContext,
  type BuildResult, type Plugin
} from "esbuild";
import { resolveConfig, JAVAFY_VERSION, type JavafyConfig } from "@javafy/core";
import { terminal } from "./terminal.js";
import { createDevClientScript, createModuleGraph, serializeBuildErrors, createFastRefreshPlugin, createReactDomClientPlugin, resolveServerOptions, listenServer, FAST_REFRESH_PREAMBLE, FAST_REFRESH_FOOTER } from "./runtime.js";

const command = process.argv[2] ?? "dev";

function help(): void {
  console.log(`
Javafy ${JAVAFY_VERSION}

Usage:
  javafy <command>

Commands:
  create    Create a new Javafy application
  dev       Start the development server with routing and React Fast Refresh
  build     Build the application for production
  start     Start the production SSR/API server
  --version Show the current version
  --help    Show this help message

Routing:
  src/app/page.tsx             /
  src/app/about/page.tsx       /about
  src/app/blog/[id]/page.tsx   /blog/:id
  src/app/layout.tsx           Shared layout
`);
}

function createProject(input?: string): void {
  const requestedPath = input?.trim();
  if (!requestedPath) {
    terminal.error("Usage: javafy create <project-name>");
    process.exitCode = 1;
    return;
  }

  const target = resolve(process.cwd(), requestedPath);
  const projectName = basename(target)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || "javafy-app";

  if (existsSync(target)) {
    if (!statSync(target).isDirectory() || readdirSync(target).length > 0) {
      terminal.error("Target directory already exists and is not empty: " + target);
      process.exitCode = 1;
      return;
    }
  }

  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: projectName,
      version: "1.0.1",
      private: true,
      type: "module",
      scripts: { dev: "javafy dev", build: "javafy build", start: "javafy start" },
      dependencies: {
        "@javafy/cli": "1.0.1",
        "@javafy/core": "1.0.1",
        "@javafy/router": "1.0.1",
        "@javafy/server": "1.0.1",
        react: "^19.1.0",
        "react-dom": "^19.1.0"
      },
      devDependencies: {
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        typescript: "^5.8.3"
      }
    }, null, 2) + "\n",
    "javafy.config.js": 'export default {\n  name: ' + JSON.stringify(projectName) + ',\n  dev: { host: "0.0.0.0", port: 3000 },\n  publicDir: "public"\n};\n',
    "index.html": '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>' + projectName + '</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n',
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true
      },
      include: ["src/**/*.tsx", "src/**/*.ts"]
    }, null, 2) + "\n",
    "src/app/layout.tsx": 'import type { ReactNode } from "react";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return <main>{children}</main>;\n}\n',
    "src/app/page.tsx": 'export default function HomePage() {\n  return (\n    <section>\n      <h1>Welcome to Javafy!</h1>\n      <p>Your application is ready.</p>\n    </section>\n  );\n}\n',
    "README.md": '# ' + projectName + '\n\nA Javafy application.\n\n## Getting started\n\n\x60\x60\x60sh\nnpm install\nnpm run dev\n\x60\x60\x60\n\nOpen http://localhost:3000.\n\n## Production\n\n\x60\x60\x60sh\nnpm run build\nnpm run start\n\x60\x60\x60\n'
  };

  try {
    mkdirSync(target, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      const destination = join(target, file);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, { flag: "wx" });
    }
    mkdirSync(join(target, "public"), { recursive: true });
    terminal.title("application created successfully");
    terminal.success("Your Javafy project is ready.");
    terminal.info("Next steps");
    terminal.step("cd " + requestedPath);
    terminal.step("npm install");
    terminal.step("npm run dev");
  } catch (error) {
    terminal.error("Could not create the project.", error);
    process.exitCode = 1;
  }
}

async function loadConfig(): Promise<JavafyConfig> {
  const configPath = resolve(process.cwd(), "javafy.config.js");
  if (!existsSync(configPath)) return {};
  const loaded = await import(pathToFileURL(configPath).href) as { default?: JavafyConfig };
  return loaded.default ?? {};
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function getHtml(root: string): string | null {
  const indexPath = join(root, "index.html");
  return existsSync(indexPath) ? readFileSync(indexPath, "utf8") : null;
}

interface DiscoveredRoute {
  path: string;
  page: string;
  layouts: string[];
  loading?: string;
}

function discoverRoutes(appDir: string): {
  routes: DiscoveredRoute[];
  notFound?: string;
  watchDirs: string[];
} {
  const routes: DiscoveredRoute[] = [];
  const watchDirs: string[] = [];
  const notFoundPath = [join(appDir, "not-found.tsx"), join(appDir, "not-found.ts")]
    .find(existsSync);
  const layoutFile = (directory: string) =>
    [join(directory, "layout.tsx"), join(directory, "layout.ts")].find(existsSync);

  function walk(directory: string, segments: string[]): void {
    watchDirs.push(directory);
    const entries = readdirSync(directory, { withFileTypes: true });
    const page = entries
      .filter((entry) => entry.isFile() && (entry.name === "page.tsx" || entry.name === "page.ts"))
      .map((entry) => join(directory, entry.name))[0];
    const localLoading = [join(directory, "loading.tsx"), join(directory, "loading.ts")].find(existsSync);
    let inheritedLoading = [join(appDir, "loading.tsx"), join(appDir, "loading.ts")].find(existsSync);
    let loadingParent = appDir;
    for (const segment of segments) {
      loadingParent = join(loadingParent, segment);
      inheritedLoading = [join(loadingParent, "loading.tsx"), join(loadingParent, "loading.ts")].find(existsSync) ?? inheritedLoading;
    }

    if (page) {
      const routeSegments = segments.map((segment) => {
        if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) return "*" + segment.slice(5, -2) + "?";
        if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return "*" + segment.slice(4, -1);
        return /^\[[^\]]+\]$/.test(segment) ? ":" + segment.slice(1, -1) : segment;
      });
      const layouts: string[] = [];
      const rootLayout = layoutFile(appDir);
      if (rootLayout) layouts.push(rootLayout);
      let parent = appDir;
      for (const segment of segments) {
        parent = join(parent, segment);
        const nestedLayout = layoutFile(parent);
        if (nestedLayout) layouts.push(nestedLayout);
      }
      routes.push({
        path: routeSegments.length ? `/${routeSegments.join("/")}` : "/",
        page,
        layouts,
        ...((localLoading ?? inheritedLoading) ? { loading: localLoading ?? inheritedLoading } : {})
      });
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
        walk(join(directory, entry.name), [...segments, entry.name]);
      }
    }
  }

  if (existsSync(appDir) && statSync(appDir).isDirectory()) walk(appDir, []);
  return { routes, ...(notFoundPath ? { notFound: notFoundPath } : {}), watchDirs };
}

function hasRoutePages(appDir: string): boolean {
  return discoverRoutes(appDir).routes.length > 0;
}

function createRouterPlugin(root: string, appDir: string): Plugin {
  return {
    name: "javafy-file-router",
    setup(build) {
      build.onResolve({ filter: /^javafy:router-entry$/ }, () => ({
        path: "router-entry",
        namespace: "javafy-router"
      }));
      build.onLoad({ filter: /.*/, namespace: "javafy-router" }, () => {
        const discovered = discoverRoutes(appDir);
        if (discovered.routes.length === 0) {
          return { errors: [{ text: `No page.tsx or page.ts found in ${appDir}` }] };
        }

        const imports = new Map<string, string>();
        const importFor = (file: string): string => {
          const existing = imports.get(file);
          if (existing) return existing;
          const name = `JavafyModule${imports.size}`;
          imports.set(file, name);
          return name;
        };

        for (const route of discovered.routes) {
          importFor(route.page);
          route.layouts.forEach(importFor);
          if (route.loading) importFor(route.loading);
        }
        if (discovered.notFound) importFor(discovered.notFound);

        const source = [
          'import React, { createElement } from "react";',
          'import { hydrateRoot } from "react-dom/client";',
          'import { createRouter } from "@javafy/router";',
          ...[...imports.entries()].map(([file, name]) =>
            `import ${name} from ${JSON.stringify(file)};`
          ),
          "const Router = createRouter({",
          "  routes: [",
          ...discovered.routes.map((route) => {
            const page = importFor(route.page);
            const layouts = route.layouts.map(importFor);
            const loading = route.loading ? importFor(route.loading) : "undefined";
            return `    { path: ${JSON.stringify(route.path)}, component: ${page}, layouts: [${layouts.join(", ")}], loading: ${loading}, props: window.__JAVAFY_DATA__?.[window.location.pathname] ?? {} },`;
          }),
          "  ],",
          ...(discovered.notFound ? [`  notFound: ${importFor(discovered.notFound)},`] : []),
          `  loadData: async (url, signal) => { const response = await fetch("/__javafy/data?url=" + encodeURIComponent(url.pathname + url.search), { headers: { Accept: "application/json" }, signal }); if (!response.ok) throw new Error("Javafy navigation data request failed (" + response.status + ")."); return response.json(); },`,
          "});",
          'const root = document.getElementById("root");',
          'if (!root) throw new Error("Javafy: #root element was not found.");',
          "hydrateRoot(root, createElement(Router));"
        ].join("\n");

        return {
          contents: source,
          loader: "tsx",
          resolveDir: root,
          watchDirs: [...new Set(discovered.watchDirs)]
        };
      });
    }
  };
}

function entryOptions(root: string, appDir: string) {
  const usesRouter = hasRoutePages(appDir);
  const entry = resolve(root, "src/main.tsx");
  return {
    entryPoints: [usesRouter ? "javafy:router-entry" : entry],
    plugins: usesRouter ? [createRouterPlugin(root, appDir)] : [],
    usesRouter,
    entry
  };
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const method = (request.method ?? "GET").toUpperCase();
  const controller = new AbortController();
  request.on("aborted", () => controller.abort());
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD") {
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const host = request.headers.host ?? "localhost";
  const init: RequestInit = { method, headers, signal: controller.signal };
  if (body) init.body = body as unknown as BodyInit;
  return new Request("http://" + host + (request.url ?? "/"), init);
}

async function sendWebResponse(response: Response, target: ServerResponse): Promise<void> {
  target.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  target.end(Buffer.from(await response.arrayBuffer()));
}

async function sendNavigationData(
  incoming: Request,
  manifest: Awaited<ReturnType<typeof loadFullstackManifest>>
): Promise<Response> {
  try {
    const endpoint = new URL(incoming.url);
    const targetPath = endpoint.searchParams.get("url");
    if (!targetPath || !targetPath.startsWith("/") || targetPath.startsWith("//")) {
      return Response.json({ error: "Invalid navigation URL." }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const target = new URL(targetPath, endpoint.origin);
    if (target.origin !== endpoint.origin || target.pathname.startsWith("/__javafy/")) {
      return Response.json({ error: "Invalid navigation URL." }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const pageRequest = new Request(target.href, { headers: incoming.headers, signal: incoming.signal });
    const rendered = await renderFullstackPage(manifest, target.pathname, { request: pageRequest });
    return Response.json({ props: rendered?.props ?? {}, status: rendered?.status ?? 404 }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    terminal.error("Navigation data request failed.", error);
    return Response.json({ error: "Navigation data could not be loaded." }, {
      status: 500,
      headers: { "cache-control": "no-store" }
    });
  }
}


function renderHtmlDocument(
  shell: string,
  body: string,
  pathname: string,
  props: Record<string, unknown>,
  scriptPath: string,
  liveReload = false
): string {
  const data = JSON.stringify({ [pathname]: props }).replace(/</g, "\\u003c");
  const scripts = [
    "<script>window.__JAVAFY_FULLSTACK__=true;window.__JAVAFY_DATA__=" + data + ";</script>",
    liveReload ? '<script src="/__javafy/client.js"></script>' : "",
    liveReload ? '<script type="module" src="/__javafy/refresh-preamble.js"></script>' : "",
    '<script type="module" src="' + scriptPath + '"></script>'
  ].filter(Boolean).join("\n");
  const root = '<div id="root">' + body + "</div>";
  const rootPattern = /<div\b(?=[^>]*\bid=["']root["'])[^>]*>\s*<\/div>/i;
  const withRoot = rootPattern.test(shell)
    ? shell.replace(rootPattern, root)
    : shell.includes("</body>")
      ? shell.replace("</body>", root + "</body>")
      : shell + root;
  return withRoot.includes("</body>")
    ? withRoot.replace("</body>", scripts + String.fromCharCode(10) + "</body>")
    : withRoot + scripts;
}

function sendText(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

function injectDevScripts(html: string): string {
  if (html.includes("/@javafy/app.js")) return html;
  const scripts = [
    '<script src="/__javafy/client.js"></script>',
    '<script type="module" src="/__javafy/refresh-preamble.js"></script>',
    '<script type="module" src="/@javafy/app.js"></script>'
  ].join("\n");
  return html.includes("</body>")
    ? html.replace("</body>", scripts + "\n</body>")
    : html + scripts;
}

async function dev(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const serverOptions = resolveServerOptions(config);
  const root = process.cwd();
  const appDir = resolve(root, config.appDir);
  const entryConfig = entryOptions(root, appDir);
  const manifestFile = resolve(root, ".javafy/server-manifest.mjs");
  await buildFullstackManifest(root, appDir, manifestFile);
  let manifest = await loadFullstackManifest(manifestFile);
  let apiHandler = createApiRouter(manifest.apiRoutes, manifest.middleware ? [manifest.middleware] : []);
  const clients = new Set<ServerResponse>();
  const devOutputDirectory = resolve(root, ".javafy/dev");
  let devOutputFiles = new Map<string, Uint8Array>();
  let buildErrors = false;
  let currentBuildErrorPayload = "[]";
  let moduleGraph = { modules: [] as Array<{ id: string; imports: string[] }> };

  // Start the server only after esbuild's initial watch build has completed.
  // Calling rebuild() and then watch() performs two builds; the second one can
  // otherwise be mistaken for a user edit and emit a stale HMR update.
  let resolveInitialWatchBuild!: () => void;
  const initialWatchBuild = new Promise<void>((resolve) => {
    resolveInitialWatchBuild = resolve;
  });

  if (!entryConfig.usesRouter && !existsSync(entryConfig.entry)) {
    terminal.error("src/main.tsx or a page in src/app/ was not found.");
    process.exitCode = 1;
    return;
  }

  const context = await createBuildContext({
    absWorkingDir: root,
    entryPoints: {
      app: entryConfig.entryPoints[0],
      "react-dom-client": "react-dom/client",
      "react-refresh": "react-refresh/runtime"
    },
    outdir: devOutputDirectory,
    entryNames: "[name]",
    chunkNames: "chunks/[name]-[hash]",
    splitting: true,
    plugins: [
      ...entryConfig.plugins,
      createFastRefreshPlugin(root),
      createReactDomClientPlugin(root),
      {
        name: "javafy-live-reload",
        setup(build) {
          build.onEnd((result: BuildResult) => {
            buildErrors = result.errors.length > 0;
            if (buildErrors) {
              const payload = serializeBuildErrors(result.errors);
              currentBuildErrorPayload = payload;
              for (const client of clients) client.write("event: build-error\ndata: " + payload + "\n\n");
              terminal.error("Compilation failed.");
              for (const error of result.errors) terminal.step(error.text);
              resolveInitialWatchBuild();
              return;
            }
            currentBuildErrorPayload = "[]";
            devOutputFiles = new Map((result.outputFiles ?? []).map((file) => {
              const outputPath = relative(devOutputDirectory, resolve(file.path)).split(sep).join("/");
              const contents = outputPath === "app.js"
                ? Buffer.concat([Buffer.from(file.contents), Buffer.from("\n" + FAST_REFRESH_FOOTER)])
                : file.contents;
              return [outputPath, contents];
            }));
            moduleGraph = createModuleGraph(result.metafile, root);
            for (const client of clients) {
              client.write("event: build-success\ndata: ready\n\n");
              client.write("event: hmr\ndata: updated\n\n");
            }
            terminal.success("Application rebuilt.");
            resolveInitialWatchBuild();
          });
        }
      }
    ],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: ["es2022"],
    sourcemap: "inline",
    jsx: "automatic",
    logLevel: "silent",
    metafile: true
  });

  await context.watch();
  await initialWatchBuild;

  // Keep server-side route modules in sync while the dev server is running.
  const manifestWatchers = new Map<string, ReturnType<typeof watch>>();
  let manifestReloadTimer: ReturnType<typeof setTimeout> | undefined;
  const syncManifestWatchers = () => {
    for (const directory of discoverFullstackFiles(appDir).watchDirs) {
      if (manifestWatchers.has(directory)) continue;
      try {
        const watcher = watch(directory, () => {
          if (manifestReloadTimer) clearTimeout(manifestReloadTimer);
          manifestReloadTimer = setTimeout(async () => {
            try {
              await buildFullstackManifest(root, appDir, manifestFile);
              manifest = await loadFullstackManifest(manifestFile);
              apiHandler = createApiRouter(manifest.apiRoutes, manifest.middleware ? [manifest.middleware] : []);
              syncManifestWatchers();
              terminal.info("Server routes refreshed.");
            } catch (error) {
              terminal.error("Server route rebuild failed.", error);
            }
          }, 100);
        });
        manifestWatchers.set(directory, watcher);
      } catch (error) {
        terminal.warning("Could not watch " + directory, error);
      }
    }
  };
  syncManifestWatchers();

  const server = createServer(async (request, response) => {
    const rawUrl = request.url ?? "/";
    if (rawUrl.split("?")[0] === "/__javafy/refresh-preamble.js") {
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(FAST_REFRESH_PREAMBLE);
      return;
    }

    if (rawUrl.split("?")[0] === "/__javafy/client.js") {
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(createDevClientScript());
      return;
    }

    if (rawUrl.split("?")[0] === "/__javafy/assets") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify([...devOutputFiles.keys()]));
      return;
    }

    if (rawUrl.split("?")[0] === "/__javafy/module-graph") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify(moduleGraph));
      return;
    }

    if (rawUrl === "/__javafy/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      response.write("event: connected\ndata: ready\n\n");
      clients.add(response);
      if (buildErrors) response.write("event: build-error\ndata: " + currentBuildErrorPayload + "\n\n");
      response.on("close", () => clients.delete(response));
      return;
    }

    if (rawUrl.split("?")[0].startsWith("/@javafy/")) {
      const assetPath = rawUrl.split("?")[0].slice("/@javafy/".length);
      const asset = devOutputFiles.get(assetPath);
      if (!asset || buildErrors) {
        response.writeHead(buildErrors ? 503 : 404, { "content-type": "text/plain; charset=utf-8" });
        response.end(buildErrors ? "Javafy compilation failed. Check the terminal." : "Javafy development asset not found.");
        return;
      }
      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(Buffer.from(asset));
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(rawUrl, "http://localhost").pathname;
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }

    if (pathname === "/__javafy/data") {
      try {
        const webRequest = await toWebRequest(request);
        const handler = createMiddlewareHandler(manifest.middleware ? [manifest.middleware] : [], (current) => sendNavigationData(current, manifest));
        await sendWebResponse(await handler(webRequest), response);
      } catch (error) {
        terminal.error("Navigation middleware failed.", error);
        sendText(response, 500, "Navigation data could not be loaded.");
      }
      return;
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      try {
        const webRequest = await toWebRequest(request);
        await sendWebResponse(await apiHandler(webRequest), response);
      } catch (error) {
        terminal.error("API request failed.", error);
        sendText(response, 500, "Internal server error");
      }
      return;
    }

    const publicRoot = resolve(root, config.publicDir);
    const relative = normalize(pathname).replace(/^([/\\\\])+/, "") || "index.html";
    let target = resolve(publicRoot, relative);

    if (target !== publicRoot && !target.startsWith(publicRoot + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    const isRouterShell = entryConfig.usesRouter && pathname === "/" && relative === "index.html";
    if (!isRouterShell && existsSync(target) && statSync(target).isFile()) {
      response.writeHead(200, {
        "content-type": mimeTypes[extname(target)] ?? "application/octet-stream"
      });
      const fileContent = readFileSync(target);
      if (extname(target) === ".html") {
        response.end(request.method === "HEAD" ? undefined : injectDevScripts(fileContent.toString("utf8")));
      } else {
        response.end(request.method === "HEAD" ? undefined : fileContent);
      }
      return;
    }

    if (!entryConfig.usesRouter && pathname === "/" && !extname(pathname)) {
      const html = getHtml(root) ?? getHtml(publicRoot);
      if (html) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(request.method === "HEAD" ? undefined : injectDevScripts(html));
        return;
      }
    }

    if (entryConfig.usesRouter && !extname(pathname)) {
      const html = getHtml(root) ?? getHtml(publicRoot);
      if (html) {
        try {
          const webRequest = await toWebRequest(request);
          const pageHandler = createMiddlewareHandler(manifest.middleware ? [manifest.middleware] : [], async (current) => {
            const rendered = await renderFullstackPage(manifest, pathname, { request: current });
            const document = renderHtmlDocument(html, rendered?.html ?? "", pathname, rendered?.props ?? {}, "/@javafy/app.js", true);
            return new Response(request.method === "HEAD" ? null : document, {
              status: rendered ? rendered.status : 404,
              headers: { "content-type": "text/html; charset=utf-8" }
            });
          });
          await sendWebResponse(await pageHandler(webRequest), response);
          return;
        } catch (error) {
          sendText(response, 500, error instanceof Error ? error.message : "Server rendering failed");
          return;
        }
      }
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Javafy: file not found.");
  });

  try {
    await listenServer(server, serverOptions.port, serverOptions.host);
  } catch (error) {
    for (const watcher of manifestWatchers.values()) watcher.close();
    if (manifestReloadTimer) clearTimeout(manifestReloadTimer);
    await context.dispose();
    throw error;
  }
  terminal.title("development server");
  terminal.success("Javafy " + JAVAFY_VERSION + " is ready.");
  terminal.section("Development");
  terminal.url("Local", "http://" + serverOptions.host + ":" + serverOptions.port);
  terminal.keyValue("File routing", terminal.enabled(entryConfig.usesRouter));
  terminal.keyValue("TSX compiler", terminal.enabled(true));
  terminal.keyValue("Live reload", terminal.enabled(true));

  const shutdown = async () => {
    server.close();
    for (const watcher of manifestWatchers.values()) watcher.close();
    if (manifestReloadTimer) clearTimeout(manifestReloadTimer);
    await context.dispose();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function build(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const root = process.cwd();
  const appDir = resolve(root, config.appDir);
  const entryConfig = entryOptions(root, appDir);
  const output = resolve(root, "dist");
  const publicRoot = resolve(root, config.publicDir);

  if (!entryConfig.usesRouter && !existsSync(entryConfig.entry)) {
    terminal.error("src/main.tsx or a page in src/app/ was not found.");
    process.exitCode = 1;
    return;
  }

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  if (existsSync(publicRoot)) cpSync(publicRoot, output, { recursive: true });

  const html = getHtml(root) ?? getHtml(publicRoot) ??
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>';

  await esbuild({
    absWorkingDir: root,
    entryPoints: entryConfig.entryPoints,
    plugins: entryConfig.plugins,
    bundle: true,
    outdir: join(output, "assets"),
    entryNames: "app",
    platform: "browser",
    format: "esm",
    target: ["es2022"],
    minify: true,
    sourcemap: false,
    jsx: "automatic"
  });

  const manifestFile = join(output, "server", "manifest.mjs");
  await buildFullstackManifest(root, appDir, manifestFile);
  writeFileSync(join(output, "server", "shell.html"), html);

  if (entryConfig.usesRouter) {
    const manifest = await loadFullstackManifest(manifestFile);
    const staticPaths = await getStaticRoutePaths(manifest);
    for (const pathname of staticPaths) {
      const rendered = await renderFullstackPage(manifest, pathname, { static: true });
      if (!rendered) continue;
      const document = renderHtmlDocument(html, rendered.html, pathname, rendered.props, "/assets/app.js");
      const relative = pathname === "/" ? "index.html" : join(pathname.replace(/^\//, ""), "index.html");
      const destination = join(output, relative);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, document);
      terminal.step("SSG " + pathname);
    }
    writeFileSync(join(output, "_redirects"), "/* /index.html 200\n");
  } else if (html) {
    writeFileSync(join(output, "index.html"), html.replace("</body>", '<script type="module" src="/assets/app.js"></script>\n</body>'));
  }

  terminal.title("production build");
  terminal.success("Production build created in dist/.");
  terminal.section("Build output");
  terminal.keyValue("Directory", "dist/");
  terminal.keyValue("File-based routing", terminal.enabled(entryConfig.usesRouter));
  if (entryConfig.usesRouter) terminal.info("Client-side routes enabled; SPA fallback written to dist/_redirects.");
}

async function start(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const root = process.cwd();
  const output = resolve(root, "dist");
  const manifestFile = join(output, "server", "manifest.mjs");
  if (!existsSync(manifestFile)) {
    terminal.error("Production server manifest not found. Run javafy build first.");
    process.exitCode = 1;
    return;
  }
  const manifest = await loadFullstackManifest(manifestFile);
  const apiHandler = createApiRouter(manifest.apiRoutes, manifest.middleware ? [manifest.middleware] : []);
  const { port, host } = resolveServerOptions(config, process.env);

  const server = createServer(async (request, response) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      sendText(response, 400, "Bad request");
      return;
    }

    if (pathname === "/__javafy/data") {
      try {
        const webRequest = await toWebRequest(request);
        const handler = createMiddlewareHandler(manifest.middleware ? [manifest.middleware] : [], (current) => sendNavigationData(current, manifest));
        await sendWebResponse(await handler(webRequest), response);
      } catch (error) {
        terminal.error("Navigation middleware failed.", error);
        sendText(response, 500, "Navigation data could not be loaded.");
      }
      return;
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      try {
        await sendWebResponse(await apiHandler(await toWebRequest(request)), response);
      } catch (error) {
        terminal.error("API request failed.", error);
        sendText(response, 500, "Internal server error");
      }
      return;
    }

    const relative = normalize(pathname).replace(/^([/\\\\])+/, "") || "index.html";
    let target = resolve(output, relative);
    if (target !== output && !target.startsWith(output + sep)) {
      sendText(response, 403, "Forbidden");
      return;
    }
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    if (pathname === "/" && !existsSync(target)) target = join(output, "index.html");

    if (existsSync(target) && statSync(target).isFile()) {
      response.writeHead(200, {
        "content-type": mimeTypes[extname(target)] ?? "application/octet-stream"
      });
      response.end(request.method === "HEAD" ? undefined : readFileSync(target));
      return;
    }

    if (!extname(pathname)) {
      try {
        const webRequest = await toWebRequest(request);
        const shellFile = join(output, "server", "shell.html");
        const shell = existsSync(shellFile) ? readFileSync(shellFile, "utf8") : getHtml(root) ?? '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
        const pageHandler = createMiddlewareHandler(manifest.middleware ? [manifest.middleware] : [], async (current) => {
          const rendered = await renderFullstackPage(manifest, pathname, { request: current });
          if (!rendered) return new Response("Javafy: page not found.", { status: 404 });
          const document = renderHtmlDocument(shell, rendered.html, pathname, rendered.props, "/assets/app.js");
          return new Response(request.method === "HEAD" ? null : document, {
            status: rendered.status,
            headers: { "content-type": "text/html; charset=utf-8" }
          });
        });
        await sendWebResponse(await pageHandler(webRequest), response);
        return;
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : "Server rendering failed");
        return;
      }
    }

    sendText(response, 404, "Javafy: file not found.");
  });

  await listenServer(server, port, host);
  terminal.title("production server");
  terminal.success("Javafy production server is ready.");
  terminal.section("Production");
  terminal.url("Local", "http://" + host + ":" + port);
  terminal.keyValue("API routes", terminal.enabled(true));
  terminal.keyValue("Server rendering", terminal.enabled(true));
}

async function main(): Promise<void> {
  if (command === "--help" || command === "help") return help();
  if (command === "--version" || command === "-v") {
    console.log(JAVAFY_VERSION);
    return;
  }
  if (command === "create") return createProject(process.argv[3]);
  if (command === "dev") return dev();
  if (command === "build") return build();
  if (command === "start") return start();
  terminal.error("Unknown command: " + command);
  help();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  terminal.error("Unexpected Javafy error.", error);
  process.exitCode = 1;
});