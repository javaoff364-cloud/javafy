import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "javafy-package-install-"));
const tarballDir = join(temporary, "tarballs");
const fixtureDir = join(temporary, "fixture");
mkdirSync(tarballDir, { recursive: true }); mkdirSync(fixtureDir, { recursive: true });
function run(command, args, cwd = root) { const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); assert.equal(result.status, 0, command + " " + args.join(" ") + " failed:\n" + result.stdout + "\n" + result.stderr); return result.stdout; }
try {
 const output = run("npm", ["pack", "--pack-destination", tarballDir, "--json"]); const [packed] = JSON.parse(output);
 assert.equal(packed.name, "javafy"); assert.equal(packed.version, "1.0.2");
 const files = packed.files.map((file) => file.path);
 for (const required of ["dist/index.js","dist/vercel.js","packages/core/dist/index.js","packages/router/dist/index.js","packages/server/dist/index.js","packages/compiler/dist/index.js","README.md","LICENSE"]) assert.ok(files.includes(required), "npm tarball is missing " + required);
 assert.ok(!files.some((file) => /(^|\\/)(test|tests|\\.github|src)(\\/|$)/.test(file)), "npm tarball contains development-only files");
 assert.ok(!files.some((file) => /\\.map$|\\.tsbuildinfo$/.test(file)), "npm tarball contains build metadata");
 run("npm", ["install","--offline","--no-audit","--no-fund","--no-save","--package-lock=false","--prefix",fixtureDir,join(tarballDir,packed.filename)]);
 const imports=['import { resolveConfig } from "javafy";','import { createRouter } from "javafy/router";','import { createApiRouter } from "javafy/server";','import { parse } from "javafy/compiler";','if (resolveConfig().dev.port !== 3000) throw new Error("core export failed");','if (typeof createRouter !== "function" || typeof createApiRouter !== "function") throw new Error("runtime exports failed");','if (parse("page Home { render {} }").page.name !== "Home") throw new Error("compiler export failed");'].join("\\n");
 run(process.execPath,["--input-type=module","-e",imports],fixtureDir);
 assert.equal(run(process.execPath,["node_modules/javafy/dist/index.js","--version"],fixtureDir).trim(),"1.0.2");
 console.log("Single-package install, ESM exports, and bundled CLI passed.");
} finally { rmSync(temporary,{recursive:true,force:true}); }
