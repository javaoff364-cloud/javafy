import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const output = resolve(root, "dist");
mkdirSync(output, { recursive: true });

function rewriteDeclarations(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (statSync(file).isDirectory()) rewriteDeclarations(file);
    else if (name.endsWith(".d.ts")) {
      const source = readFileSync(file, "utf8");
      const updated = source.replace(/(["'])@javafy\/(core|router|server|compiler)\1/g, (_match, quote, part) => quote + "javafy/" + part + quote);
      if (updated !== source) writeFileSync(file, updated);
    }
  }
}
for (const part of ["core", "compiler", "router", "server", "cli"]) {
  rewriteDeclarations(resolve(root, "packages", part, "dist"));
}

await build({
  absWorkingDir: root,
  entryPoints: {
    core: "packages/core/dist/index.js",
    compiler: "packages/compiler/dist/index.js",
    router: "packages/router/dist/index.js",
    server: "packages/server/dist/index.js",
    index: "packages/cli/dist/index.js",
    vercel: "packages/cli/dist/vercel.js"
  },
  outdir: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  alias: {
    "@javafy/core": resolve(root, "packages/core/dist/index.js"),
    "@javafy/server": resolve(root, "packages/server/dist/index.js")
  },
  external: [
    "esbuild", "react", "react-dom", "react-dom/*", "@javafy/router",
    "@babel/core", "@babel/preset-react", "@babel/preset-typescript",
    "react-refresh", "react-refresh/*"
  ],
  sourcemap: false,
  logLevel: "info"
});

// Keep one router context shared by the framework runtime and user page imports.
for (const name of ["index.js", "vercel.js"]) {
  const file = resolve(output, name);
  const source = readFileSync(file, "utf8");
  writeFileSync(file, source.replaceAll('"@javafy/router"', '"javafy/router"'));
}
