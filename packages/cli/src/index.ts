#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync,
  watch, writeFileSync
} from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createApiRouter } from "@javafy/server";
import { buildFullstackManifest, discoverFullstackFiles, getStaticRoutePaths, loadFullstackManifest, renderFullstackPage } from "./fullstack.js";
import {
  build as esbuild, context as createBuildContext,
  type BuildResult, type Plugin
} from "esbuild";
import { resolveConfig, JAVAFY_VERSION, type JavafyConfig } from "@javafy/core";

const command = process.argv[2] ?? "dev";

function help(): void {
  console.log(`
Javafy ${JAVAFY_VERSION}

Usage:
  javafy <command>

Commands:
  dev       Start the development server with routing and live reload
  build     Build the application for production
  --version Show the current version
  --help    Show this help message

Routing:
  src/app/page.tsx             /
  src/app/about/page.tsx       /about
  src/app/blog/[id]/page.tsx   /blog/:id
  src/app/layout.tsx           Shared layout
`);
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

    if (page) {
      const routeSegments = segments.map((segment) =>
        /^\[.+\]$/.test(segment) ? `:${segment.slice(1, -1)}` : segment
      );
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
        layouts
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
            return `    { path: ${JSON.stringify(route.path)}, component: ${page}, layouts: [${layouts.join(", ")}], props: window.__JAVAFY_DATA__?.[window.location.pathname] ?? {} },`;
          }),
          "  ],",
          ...(discovered.notFound ? [`  notFound: ${importFor(discovered.notFound)},`] : []),
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
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD") {
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const host = request.headers.host ?? "localhost";
  const init: RequestInit = { method, headers };
  if (body) init.body = body;
  return new Request("http://" + host + (request.url ?? "/"), init);
}

async function sendWebResponse(response: Response, target: ServerResponse): Promise<void> {
  target.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  target.end(Buffer.from(await response.arrayBuffer()));
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
    "<script>window.__JAVAFY_DATA__=" + data + ";</script>",
    liveReload ? '<script>const events=new EventSource("/__javafy/events");events.addEventListener("reload",()=>location.reload());</script>' : "",
    '<script type="module" src="' + scriptPath + '"></script>'
  ].filter(Boolean).join("\n");
  const root = '<div id="root">' + body + "</div>";
  const withRoot = shell.includes('<div id="root"></div>')
    ? shell.replace('<div id="root"></div>', root)
    : shell.replace("</body>", root + "</body>");
  return withRoot.includes("</body>")
    ? withRoot.replace("</body>", scripts + String.fromCharCode(10) + "</body>")
    : withRoot + scripts;
}

function sendText(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

async function dev(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const root = process.cwd();
  const appDir = resolve(root, config.appDir);
  const entryConfig = entryOptions(root, appDir);
  const manifestFile = resolve(root, ".javafy/server-manifest.js");
  await buildFullstackManifest(root, appDir, manifestFile);
  let manifest = await loadFullstackManifest(manifestFile);
  let apiHandler = createApiRouter(manifest.apiRoutes);
  const clients = new Set<ServerResponse>();
  let bundle = "";
  let buildErrors = false;

  if (!entryConfig.usesRouter && !existsSync(entryConfig.entry)) {
    console.error("Javafy: src/main.tsx or a page in src/app/ was not found.");
    process.exitCode = 1;
    return;
  }

  const context = await createBuildContext({
    absWorkingDir: root,
    entryPoints: entryConfig.entryPoints,
    plugins: [
      ...entryConfig.plugins,
      {
        name: "javafy-live-reload",
        setup(build) {
          build.onEnd((result: BuildResult) => {
            buildErrors = result.errors.length > 0;
            if (!buildErrors && result.outputFiles?.[0]) {
              bundle = result.outputFiles[0].text;
              for (const client of clients) client.write("event: reload\ndata: updated\n\n");
              console.log("  Javafy: application rebuilt");
            } else if (buildErrors) {
              console.error("Javafy: compilation failed");
              for (const error of result.errors) console.error(error.text);
            }
          });
        }
      }
    ],
    bundle: true,
    write: false,
    outfile: "app.js",
    platform: "browser",
    format: "esm",
    target: ["es2022"],
    sourcemap: "inline",
    jsx: "automatic",
    logLevel: "silent"
  });

  await context.rebuild();
  await context.watch();

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
              apiHandler = createApiRouter(manifest.apiRoutes);
              syncManifestWatchers();
              console.log("  Javafy: server routes refreshed");
            } catch (error) {
              console.error("Javafy: server route rebuild failed", error);
            }
          }, 100);
        });
        manifestWatchers.set(directory, watcher);
      } catch (error) {
        console.warn("Javafy: could not watch " + directory, error);
      }
    }
  };
  syncManifestWatchers();

  const server = createServer(async (request, response) => {
    const rawUrl = request.url ?? "/";
    if (rawUrl === "/__javafy/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      response.write("event: connected\ndata: ready\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (rawUrl.split("?")[0] === "/@javafy/app.js") {
      response.writeHead(buildErrors ? 503 : 200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(buildErrors ? "console.error('Javafy compilation failed. Check the terminal.');" : bundle);
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(rawUrl.split("?")[0] ?? "/");
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      try {
        const webRequest = await toWebRequest(request);
        await sendWebResponse(await apiHandler(webRequest), response);
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : "Internal server error");
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
    if (existsSync(target) && statSync(target).isFile()) {
      response.writeHead(200, {
        "content-type": mimeTypes[extname(target)] ?? "application/octet-stream"
      });
      response.end(readFileSync(target));
      return;
    }

    if (entryConfig.usesRouter && !extname(pathname)) {
      const html = getHtml(root) ?? getHtml(publicRoot);
      if (html) {
        try {
          const webRequest = await toWebRequest(request);
          const rendered = await renderFullstackPage(manifest, pathname, { request: webRequest });
          const document = renderHtmlDocument(html, rendered?.html ?? "", pathname, rendered?.props ?? {}, "/@javafy/app.js", true);
          response.writeHead(rendered ? rendered.status : 404, { "content-type": "text/html; charset=utf-8" });
          response.end(document);
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

  server.listen(config.dev.port, config.dev.host, () => {
    console.log(`\n  Javafy ${JAVAFY_VERSION} dev server: http://${config.dev.host}:${config.dev.port}\n`);
    console.log(`  File-based routing: ${entryConfig.usesRouter ? "enabled" : "not detected"}`);
    console.log("  TypeScript/TSX compiler: enabled");
    console.log("  Live reload: enabled\n");
  });

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
    console.error("Javafy: src/main.tsx or a page in src/app/ was not found.");
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

  if (entryConfig.usesRouter) {
    const manifestFile = join(output, "server", "manifest.js");
    await buildFullstackManifest(root, appDir, manifestFile);
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
      console.log("  SSG: " + pathname);
    }
    writeFileSync(join(output, "_redirects"), "/* /index.html 200\n");
  } else if (html) {
    writeFileSync(join(output, "index.html"), html.replace("</body>", '<script type="module" src="/assets/app.js"></script>\n</body>'));
  }

  console.log("Javafy: production build created in dist/");
  if (entryConfig.usesRouter) console.log("Javafy: client-side routes enabled; SPA fallback written to dist/_redirects");
}

async function start(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const root = process.cwd();
  const output = resolve(root, "dist");
  const manifestFile = join(output, "server", "manifest.js");
  if (!existsSync(manifestFile)) {
    console.error("Javafy: production server manifest not found. Run javafy build first.");
    process.exitCode = 1;
    return;
  }
  const manifest = await loadFullstackManifest(manifestFile);
  const apiHandler = createApiRouter(manifest.apiRoutes);
  const port = Number(process.env.PORT ?? config.dev.port);
  const host = process.env.HOST ?? config.dev.host;

  const server = createServer(async (request, response) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    } catch {
      sendText(response, 400, "Bad request");
      return;
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      try {
        await sendWebResponse(await apiHandler(await toWebRequest(request)), response);
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : "Internal server error");
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
      response.end(readFileSync(target));
      return;
    }

    if (!extname(pathname)) {
      try {
        const webRequest = await toWebRequest(request);
        const rendered = await renderFullstackPage(manifest, pathname, { request: webRequest });
        if (!rendered) {
          sendText(response, 404, "Javafy: page not found.");
          return;
        }
        const shell = getHtml(root) ?? '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
        const document = renderHtmlDocument(shell, rendered.html, pathname, rendered.props, "/assets/app.js");
        response.writeHead(rendered.status, { "content-type": "text/html; charset=utf-8" });
        response.end(document);
        return;
      } catch (error) {
        sendText(response, 500, error instanceof Error ? error.message : "Server rendering failed");
        return;
      }
    }

    sendText(response, 404, "Javafy: file not found.");
  });

  server.listen(port, host, () => {
    console.log("\\n  Javafy production server: http://" + host + ":" + port + "\\n");
    console.log("  API routes: enabled");
    console.log("  Server-side rendering: enabled");
  });
}

async function main(): Promise<void> {
  if (command === "--help" || command === "help") return help();
  if (command === "--version" || command === "-v") {
    console.log(JAVAFY_VERSION);
    return;
  }
  if (command === "dev") return dev();
  if (command === "build") return build();
  if (command === "start") return start();
  console.error(`Unknown command: ${command}\n`);
  help();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Javafy error:", error);
  process.exitCode = 1;
});
