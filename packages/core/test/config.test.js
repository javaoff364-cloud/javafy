import test from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../dist/index.js";

test("fills configuration defaults", () => {
  assert.deepEqual(resolveConfig(), {
    name: "Javafy App",
    dev: { host: "localhost", port: 3000 },
    publicDir: "public",
    appDir: "src/app"
  });
});

test("accepts valid custom configuration", () => {
  assert.deepEqual(resolveConfig({ name: "Demo", dev: { host: "0.0.0.0", port: 8080 }, publicDir: "assets", appDir: "app" }), {
    name: "Demo",
    dev: { host: "0.0.0.0", port: 8080 },
    publicDir: "assets",
    appDir: "app"
  });
});

test("rejects invalid port values", () => {
  for (const port of [0, -1, 65536, 1.5, NaN]) {
    assert.throws(() => resolveConfig({ dev: { port } }), /dev\.port must be an integer between 1 and 65535/);
  }
});

test("rejects empty name, host and directories", () => {
  assert.throws(() => resolveConfig({ name: " " }), /name must be a non-empty string/);
  assert.throws(() => resolveConfig({ dev: { host: "" } }), /dev\.host must be a non-empty string/);
  assert.throws(() => resolveConfig({ publicDir: "" }), /publicDir must be a non-empty path string/);
  assert.throws(() => resolveConfig({ appDir: " " }), /appDir must be a non-empty path string/);
});
