#!/usr/bin/env node
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig, JAVAFY_VERSION, type JavafyConfig } from "@javafy/core";

const command = process.argv[2] ?? "dev";

function help(): void {
  console.log(`
Javafy ${JAVAFY_VERSION}

Usage:
  javafy <command>

Commands:
  dev       Start the development server
  build     Copy static public assets to dist
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

async function dev(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const publicRoot = resolve(process.cwd(), config.publicDir);

  const server = createServer((request, response) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent((request.url ?? "/").split("?")[0] ?? "/");
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }

    const relative = normalize(pathname).replace(/^([/\\])+/, "") || "index.html";
    let target = resolve(publicRoot, relative);

    if (target !== publicRoot && !target.startsWith(publicRoot + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    if (existsSync(target) && statSync(target).isDirectory()) {
      target = join(target, "index.html");
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      target = join(publicRoot, "index.html");
    }
    if (!existsSync(target)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Javafy: public/index.html was not found.");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[extname(target)] ?? "application/octet-stream"
    });
    response.end(readFileSync(target));
  });

  server.listen(config.dev.port, config.dev.host, () => {
    console.log(`\\n  Javafy dev server: http://${config.dev.host}:${config.dev.port}\\n`);
  });
}

async function build(): Promise<void> {
  const config = resolveConfig(await loadConfig());
  const source = resolve(process.cwd(), config.publicDir);
  const output = resolve(process.cwd(), "dist");

  if (!existsSync(source) || !statSync(source).isDirectory()) {
    console.error(`Javafy: public directory "${config.publicDir}" does not exist.`);
    process.exitCode = 1;
    return;
  }

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(source, output, { recursive: true });
  console.log("Javafy: static assets copied to dist/");
}

async function main(): Promise<void> {
  if (command === "--help" || command === "help") return help();
  if (command === "--version" || command === "-v") {
    console.log(JAVAFY_VERSION);
    return;
  }
  if (command === "dev") return dev();
  if (command === "build") return build();
  console.error(`Unknown command: ${command}\\n`);
  help();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Javafy error:", error);
  process.exitCode = 1;
});
