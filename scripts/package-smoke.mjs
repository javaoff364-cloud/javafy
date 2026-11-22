import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const workspaces = ["@javafy/core", "@javafy/router", "@javafy/server", "@javafy/cli"];
for (const workspace of workspaces) {
  const result = spawnSync("npm", ["pack", "--workspace", workspace, "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.equal(result.status, 0, workspace + " npm pack failed: " + result.stderr);
  const packed = JSON.parse(result.stdout);
  assert.equal(packed.length, 1);
  const files = packed[0].files.map((file) => file.path);
  assert.ok(files.some((file) => file.startsWith("dist/")), workspace + " does not include compiled dist files");
  assert.ok(!files.some((file) => /(^|\/)(test|tests|\.github)(\/|$)/.test(file)), workspace + " includes test or CI files");
  assert.ok(!files.some((file) => /\.map$|\.tsbuildinfo$/.test(file)), workspace + " includes build-only artifacts");
  console.log("Package verified:", workspace, packed[0].version, files.length, "files");
}
