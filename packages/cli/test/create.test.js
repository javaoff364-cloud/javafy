import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));

function runCli(cwd, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8"
  });
}

test("javafy create scaffolds a runnable project", () => {
  const workspace = mkdtempSync(join(tmpdir(), "javafy-create-"));
  try {
    const result = runCli(workspace, "create", "my-app");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /application created successfully/i);

    const project = join(workspace, "my-app");
    const pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
    assert.equal(pkg.name, "my-app");
    assert.equal(pkg.scripts.dev, "javafy dev");
    assert.equal(pkg.scripts.build, "javafy build");
    assert.equal(pkg.scripts.start, "javafy start");
    assert.equal(pkg.dependencies["@javafy/cli"], "1.0.1");
    assert.ok(readFileSync(join(project, "src/app/page.jfx"), "utf8").includes("Hello, Javafy."));
    assert.ok(readFileSync(join(project, "src/app/about/page.jfx"), "utf8").includes("Build faster. Run smarter."));
    assert.ok(readFileSync(join(project, "src/app/blog/[id]/page.jfx"), "utf8").includes("params.id"));
    assert.ok(readFileSync(join(project, "src/app/not-found.jfx"), "utf8").includes("Page not found"));
    assert.ok(readFileSync(join(project, "src/app/error.jfx"), "utf8").includes("Try again"));
    assert.ok(readFileSync(join(project, "src/app/loading.jfx"), "utf8").includes("Loading page..."));
    assert.ok(readFileSync(join(project, "public/favicon.svg"), "utf8").includes("#FF6B35"));
    assert.ok(readFileSync(join(project, "public/styles.css"), "utf8").includes("prefers-reduced-motion"));
    assert.ok(readFileSync(join(project, "src/app/layout.jfx"), "utf8").includes("RootLayout"));
    assert.ok(readFileSync(join(project, "index.html"), "utf8").includes('id="root"'));
    assert.ok(readFileSync(join(project, "index.html"), "utf8").includes('href="/styles.css"'));
    assert.ok(readFileSync(join(project, "javafy.config.js"), "utf8").includes('name: "my-app"'));
    assert.ok(readFileSync(join(project, "src/lib/greeting.jf"), "utf8").includes("function greet"));
    assert.ok(readFileSync(join(project, "api/index.js"), "utf8").includes("vercel.js"));
    assert.ok(readFileSync(join(project, "vercel.json"), "utf8").includes("outputDirectory"));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("javafy create refuses to overwrite a non-empty directory", () => {
  const workspace = mkdtempSync(join(tmpdir(), "javafy-create-existing-"));
  try {
    const project = join(workspace, "existing");
    mkdirSync(project);
    writeFileSync(join(project, "keep.txt"), "keep");
    const result = runCli(workspace, "create", "existing");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exists and is not empty/i);
    assert.equal(readFileSync(join(project, "keep.txt"), "utf8"), "keep");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("javafy create requires a project name", () => {
  const workspace = mkdtempSync(join(tmpdir(), "javafy-create-usage-"));
  try {
    const result = runCli(workspace, "create");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: javafy create <project-name>/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
