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
  assert.equal(
    result.status,
    0,
    label + " " + args.join(" ") + " failed:\n" + result.stdout + "\n" + result.stderr
  );
  return result.stdout;
}

function runNpm(args, cwd = root) {
  const result = spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return assertProcessSucceeded("npm", args, result);
}

function runNode(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return assertProcessSucceeded("node", args, result);
}

try {
  const workspaces = ["@javafy/core", "@javafy/router", "@javafy/server", "@javafy/cli"];
  const tarballs = [];
  const packageTarballNames = {
    "@javafy/core": "javafy-core",
    "@javafy/router": "javafy-router",
    "@javafy/server": "javafy-server",
    "@javafy/cli": "javafy-cli"
  };

  for (const workspace of workspaces) {
    const output = runNpm(["pack", "--workspace", workspace, "--pack-destination", tarballDir, "--json"]);
    const packed = JSON.parse(output);
    assert.equal(packed.length, 1);
    const files = packed[0].files.map((file) => file.path);
    assert.ok(files.some((file) => file.startsWith("dist/")), workspace + " does not include compiled dist files");
    assert.ok(files.includes("README.md"), workspace + " does not include its npm README");
    assert.ok(!files.some((file) => /(^|\/)(test|tests|\.github)(\/|$)/.test(file)), workspace + " includes test or CI files");
    assert.ok(!files.some((file) => /\.map$|\.tsbuildinfo$/.test(file)), workspace + " includes build-only artifacts");
    const expectedFilename = packageTarballNames[workspace] + "-1.0.0.tgz";
    assert.equal(packed[0].filename, expectedFilename, workspace + " produced an unexpected tarball name");
    // Build the path from a fixed workspace allowlist, never from subprocess output.
    const tarball = join(tarballDir, expectedFilename);
    tarballs.push(tarball);
    console.log("Packed:", workspace, packed[0].version, files.length, "files");
  }

  // Install all workspace tarballs together in an isolated project. The root
  // CI install has already populated npm's cache for third-party dependencies.
  runNpm([
    "install", "--offline", "--no-audit", "--no-fund", "--no-save",
    "--package-lock=false", "--prefix", fixtureDir, ...tarballs
  ]);

  const importCheck = [
    'import { resolveConfig } from "@javafy/core";',
    'import { createApiRouter } from "@javafy/server";',
    'import { createRouter } from "@javafy/router";',
    'if (resolveConfig().dev.port !== 3000) throw new Error("core package import failed");',
    'if (typeof createApiRouter !== "function" || typeof createRouter !== "function") throw new Error("package exports failed");'
  ].join("\n");
  runNode(["--input-type=module", "-e", importCheck], fixtureDir);

  const cliOutput = runNode(["node_modules/@javafy/cli/dist/index.js", "--version"], fixtureDir).trim();
  assert.match(cliOutput, /^\d+\.\d+\.\d+$/);
  assert.equal(readdirSync(join(fixtureDir, "node_modules", "@javafy")).length, 4);
  console.log("Clean package installation and ESM imports passed.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
