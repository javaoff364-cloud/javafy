import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const terminalModule = fileURLToPath(new URL("../dist/terminal.js", import.meta.url));

function run(source, env = {}) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

test("terminal formatter supports rich output and structured helpers", () => {
  const source = `
    import { terminal, stripAnsi } from ${JSON.stringify(terminalModule)};
    terminal.title("test session");
    terminal.section("Environment");
    terminal.success("ready");
    terminal.info("details");
    terminal.warning("careful");
    terminal.error("failed");
    terminal.keyValue("Runtime", "Node.js");
    terminal.list(["first", "second"]);
    terminal.table(["Name", "Status"], [["web", "ready"], ["api", "running"]]);
    terminal.progress(3, 4, "Building", 8);
    console.log(terminal.badge("PASS", "success"));
    console.log(terminal.link("documentation", "https://example.com"));
    console.log(stripAnsi("\\u001b[31mred\\u001b[0m"));
  `;
  const result = run(source, { NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" });
  assert.equal(result.status, 0, result.stderr);
  for (const expected of ["Javafy", "Environment", "ready", "Runtime", "web", "75%", "[PASS]", "documentation", "red"]) {
    assert.ok(result.stdout.includes(expected), "missing output: " + expected);
  }
  assert.ok(!result.stdout.includes("\\u001b["));
});

test("NO_COLOR disables ANSI styling and FORCE_COLOR enables it in non-TTY output", () => {
  const source = `
    import { terminal } from ${JSON.stringify(terminalModule)};
    terminal.success("ready");
  `;
  const plain = run(source, { NO_COLOR: "1", FORCE_COLOR: "1", TERM: "xterm-256color" });
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(!plain.stdout.includes("\\u001b["));

  const colored = run(source, { NO_COLOR: "", FORCE_COLOR: "1", TERM: "dumb" });
  assert.equal(colored.status, 0, colored.stderr);
  assert.ok(colored.stdout.includes("\\u001b["));
});

test("terminal progress handles empty totals safely", () => {
  const source = `
    import { terminal } from ${JSON.stringify(terminalModule)};
    terminal.progress(10, 0, "Waiting");
  `;
  const result = run(source, { NO_COLOR: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("0%"));
});
