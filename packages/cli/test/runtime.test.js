import test from "node:test";
import assert from "node:assert/strict";
import { createDevClientScript, createModuleGraph, serializeBuildErrors } from "../dist/runtime.js";

test("creates a stable module graph and excludes external imports", () => {
  const graph = createModuleGraph({
    inputs: {
      "src/main.tsx": {
        bytes: 10,
        imports: [
          { path: "src/App.tsx", kind: "import-statement", original: "./App" },
          { path: "react", kind: "import-statement", external: true }
        ],
        format: "esm"
      },
      "src/App.tsx": { bytes: 4, imports: [], format: "esm" }
    },
    outputs: {}
  }, "/project");
  assert.deepEqual(graph, {
    modules: [
      { id: "src/App.tsx", imports: [] },
      { id: "src/main.tsx", imports: ["src/App.tsx"] }
    ]
  });
});

test("serializes build errors without allowing HTML injection", () => {
  const value = serializeBuildErrors([{
    text: "Unexpected token <script>",
    location: { file: "src/page.tsx", line: 4, column: 2, length: 1, lineText: "<script>" },
    notes: [],
    detail: null
  }]);
  assert.match(value, /\\u003cscript>/);
  assert.doesNotThrow(() => JSON.parse(value));
});

test("dev client listens for compilation errors and HMR updates", () => {
  const script = createDevClientScript();
  assert.ok(script.includes("build-error"));
  assert.ok(script.includes("build-success"));
  assert.ok(script.includes("location.reload"));
  assert.ok(script.includes("javafy-error-overlay"));
  assert.ok(script.includes('addEventListener("hmr"'));
  assert.ok(script.includes("/@javafy/app.js"));
});

test("resolves production server defaults and valid overrides", async () => {
  const { resolveServerOptions } = await import("../dist/runtime.js");
  assert.deepEqual(resolveServerOptions({ dev: { host: "localhost", port: 3000 } }), { host: "localhost", port: 3000 });
  assert.deepEqual(resolveServerOptions({ dev: { host: "localhost", port: 3000 } }, { HOST: "0.0.0.0", PORT: "8080" }), { host: "0.0.0.0", port: 8080 });
});

test("rejects invalid production server overrides", async () => {
  const { resolveServerOptions } = await import("../dist/runtime.js");
  for (const PORT of ["0", "-1", "65536", "3.14", "abc", ""]) {
    assert.throws(() => resolveServerOptions({ dev: { host: "localhost", port: 3000 } }, { PORT }), /PORT must be an integer between 1 and 65535/);
  }
  assert.throws(() => resolveServerOptions({ dev: { host: "localhost", port: 3000 } }, { HOST: "" }), /HOST must be a non-empty hostname or IP address/);
});
