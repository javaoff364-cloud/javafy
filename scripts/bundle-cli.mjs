import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
const root = process.cwd();
const output = resolve(root, "dist");
await mkdir(output, { recursive: true });
await build({ absWorkingDir: root, entryPoints: { index: "packages/cli/dist/index.js", vercel: "packages/cli/dist/vercel.js" }, outdir: output, bundle: true, platform: "node", format: "esm", target: "node20", packages: "external", alias: { "@javafy/core": resolve(root, "packages/core/dist/index.js"), "@javafy/router": resolve(root, "packages/router/dist/index.js"), "@javafy/server": resolve(root, "packages/server/dist/index.js") }, external: ["esbuild", "react", "react-dom", "react-dom/*", "@babel/core", "@babel/preset-react", "@babel/preset-typescript", "react-refresh", "react-refresh/*"], banner: { js: "#!/usr/bin/env node" }, sourcemap: false, logLevel: "info" });
