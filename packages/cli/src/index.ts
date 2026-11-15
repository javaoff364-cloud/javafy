#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync
} from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createApiRouter } from "@javafy/server";
import { buildFullstackManifest, getStaticRoutePaths, loadFullstackManifest, renderFullstackPage } from "./fullstack.js";
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

async function dev(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const root = process.cwd();
  const appDir = resolve(root, config.appDir);
  const entryConfig = entryOptions(root, appDir);
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

  const server = createServer((request, response) => {
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

    const publicRoot = resolve(root, config.publicDir);
    const relative = normalize(pathname).replace(/^([/\\\\])+/, "") || "index.html";
    let target = resolve(publicRoot, relative);

    if (target !== publicRoot && !target.startsWith(publicRoot + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    if (
      entryConfig.usesRouter &&
      (pathname === "/" || pathname.endsWith(".html") || !extname(pathname))
    ) {
      const html = getHtml(root) ?? getHtml(publicRoot);
      if (html) {
        const liveReload = `<script>
const javafyEvents = new EventSource("/__javafy/events");
javafyEvents.addEventListener("reload", () => location.reload());
</script>
<script type="module" src="/@javafy/app.js"></script>`;
        const injected = html.includes("</body>")
          ? html.replace("</body>", liveReload + "\n</body>")
          : html + liveReload;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(injected);
        return;
      }
    }

    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    if (existsSync(target) && statSync(target).isFile()) {
      response.writeHead(200, {
        "content-type": mimeTypes[extname(target)] ?? "application/octet-stream"
      });
      response.end(readFileSync(target));
      return;
    }

    // Client-side routes share the app shell; asset requests still receive a 404.
    if (entryConfig.usesRouter && !extname(pathname)) {
      const html = getHtml(root) ?? getHtml(publicRoot);
      if (html) {
        const liveReload = `<script>
const javafyEvents = new EventSource("/__javafy/events");
javafyEvents.addEventListener("reload", () => location.reload());
</script>
<script type="module" src="/@javafy/app.js"></script>`;
        const injected = html.includes("</body>")
          ? html.replace("</body>", liveReload + "\n</body>")
          : html + liveReload;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(injected);
        return;
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

  const html = getHtml(root) ?? getHtml(publicRoot);
  if (html) {
    const productionHtml = html.replace(
      "</body>",
      '<script type="module" src="/assets/app.js"></script>\n</body>'
    );
    writeFileSync(join(output, "index.html"), productionHtml);
  }

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
    writeFileSync(join(output, "_redirects"), "/* /index.html 200\n");
  }

  console.log("Javafy: production build created in dist/");
  if (entryConfig.usesRouter) console.log("Javafy: client-side routes enabled; SPA fallback written to dist/_redirects");
}

async function main(): Promise<void> {
  if (command === "--help" || command === "help") return help();
  if (command === "--version" || command === "-v") {
    console.log(JAVAFY_VERSION);
    return;
  }
  if (command === "dev") return dev();
  if (command === "build") return build();
  console.error(`Unknown command: ${command}\n`);
  help();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Javafy error:", error);
  process.exitCode = 1;
});
