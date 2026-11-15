#!/usr/bin/env node
import { createServer, type ServerResponse } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build as esbuild, context as createBuildContext, type BuildResult } from "esbuild";
import { resolveConfig, JAVAFY_VERSION, type JavafyConfig } from "@javafy/core";

const command = process.argv[2] ?? "dev";

function help(): void {
  console.log(`
Javafy ${JAVAFY_VERSION}

Usage:
  javafy <command>

Commands:
  dev       Start the development server with TypeScript/TSX and live reload
  build     Build the application for production
  --version Show the current version
  --help    Show this help message
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

async function dev(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const root = process.cwd();
  const entry = resolve(root, "src/main.tsx");
  const clients = new Set<ServerResponse>();
  let bundle = "";
  let buildErrors = false;

  if (!existsSync(entry)) {
    console.error("Javafy: src/main.tsx not found. Create the app entry file first.");
    process.exitCode = 1;
    return;
  }

  const context = await createBuildContext({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    outfile: "app.js",
    platform: "browser",
    format: "esm",
    target: ["es2022"],
    sourcemap: "inline",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [{
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
            for (const error of result.errors) {
              console.error(error.text);
            }
          }
        });
      }
    }]
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
    const relative = normalize(pathname).replace(/^([/\\])+/, "") || "index.html";
    let target = resolve(publicRoot, relative);

    if (target !== publicRoot && !target.startsWith(publicRoot + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    if (pathname === "/" || pathname.endsWith(".html")) {
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
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Javafy: file not found.");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[extname(target)] ?? "application/octet-stream"
    });
    response.end(readFileSync(target));
  });

  server.listen(config.dev.port, config.dev.host, () => {
    console.log(`\n  Javafy ${JAVAFY_VERSION} dev server: http://${config.dev.host}:${config.dev.port}\n`);
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
  const entry = resolve(root, "src/main.tsx");
  const output = resolve(root, "dist");
  const publicRoot = resolve(root, config.publicDir);

  if (!existsSync(entry)) {
    console.error("Javafy: src/main.tsx not found.");
    process.exitCode = 1;
    return;
  }

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  if (existsSync(publicRoot)) cpSync(publicRoot, output, { recursive: true });

  const html = getHtml(root) ?? getHtml(publicRoot);
  if (html) {
    const productionHtml = html.replace("</body>", '<script type="module" src="/assets/app.js"></script>\n</body>');
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(output, "index.html"), productionHtml);
  }

  await esbuild({
    absWorkingDir: root,
    entryPoints: [entry],
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

  console.log("Javafy: production build created in dist/");
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
