import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "javafy-package-install-"));
const tarballDir = join(temporary, "tarballs");
const fixtureDir = join(temporary, "fixture");
mkdirSync(tarballDir, { recursive: true });
mkdirSync(fixtureDir, { recursive: true });

function assertProcessSucceeded(label, args, result) {
  assert.equal(result.status, 0, label + " " + args.join(" ") + " failed:\n" + result.stdout + "\n" + result.stderr);
  return result.stdout;
}
function runNpm(args, cwd = root) {
  return assertProcessSucceeded("npm", args, spawnSync("npm", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }));
}
function runNode(args, cwd = root) {
  return assertProcessSucceeded("node", args, spawnSync(process.execPath, args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }));
}

try {
  const workspaces = ["@javafy/core", "@javafy/compiler", "@javafy/router", "@javafy/server", "@javafy/cli"];
  const tarballs = [];
  const packageTarballNames = {
    "@javafy/core": "javafy-core",
    "@javafy/compiler": "javafy-compiler",
    "@javafy/router": "javafy-router",
    "@javafy/server": "javafy-server",
    "@javafy/cli": "javafy-cli"
  };

  for (const workspace of workspaces) {
    const output = runNpm(["pack", "--workspace", workspace, "--pack-destination", tarballDir, "--json"]);
    const parsed = JSON.parse(output);
    const packed = Array.isArray(parsed) ? parsed : Object.values(parsed).filter((entry) => entry && typeof entry === "object" && "filename" in entry);
    assert.equal(packed.length, 1, workspace + " should produce exactly one package tarball");
    const [packageInfo] = packed;
    const files = packageInfo.files.map((file) => file.path);
    assert.ok(files.some((file) => file.startsWith("dist/")), workspace + " does not include compiled dist files");
    assert.ok(files.includes("README.md"), workspace + " does not include its npm README");
    assert.ok(!files.some((file) => /(^|\/)(test|tests|\.github)(\/|$)/.test(file)), workspace + " includes test or CI files");
    assert.ok(!files.some((file) => /\.map$|\.tsbuildinfo$/.test(file)), workspace + " includes build-only artifacts");
    const expectedFilename = packageTarballNames[workspace] + "-1.0.1.tgz";
    assert.equal(packageInfo.filename, expectedFilename, workspace + " produced an unexpected tarball name");
    tarballs.push(join(tarballDir, expectedFilename));
    console.log("Packed:", workspace, packageInfo.version, files.length, "files");
  }

  runNpm(["install", "--offline", "--no-audit", "--no-fund", "--no-save", "--package-lock=false", "--prefix", fixtureDir, ...tarballs]);
  const importCheck = [
    'import { resolveConfig } from "@javafy/core";',
    'import { parse, generate } from "@javafy/compiler";',
    'import { createApiRouter } from "@javafy/server";',
    'import { createRouter } from "@javafy/router";',
    'if (resolveConfig().dev.port !== 3000) throw new Error("core package import failed");',
    'if (parse("page Home { render {} }").page.name !== "Home") throw new Error("compiler parser import failed");\nif (!generate(parse("page Home { render { h1 \\"Hi\\" } }")).includes("React.createElement")) throw new Error("compiler codegen import failed");',
    'if (typeof createApiRouter !== "function" || typeof createRouter !== "function") throw new Error("package exports failed");'
  ].join("\n");
  runNode(["--input-type=module", "-e", importCheck], fixtureDir);
  const cliOutput = runNode(["node_modules/@javafy/cli/dist/index.js", "--version"], fixtureDir).trim();
  assert.match(cliOutput, /^\d+\.\d+\.\d+$/);
  assert.equal(readdirSync(join(fixtureDir, "node_modules", "@javafy")).length, 5);
  console.log("Clean package installation and ESM imports passed.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
