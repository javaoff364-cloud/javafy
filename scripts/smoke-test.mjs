import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const root = process.cwd();
const exampleDir = resolve(root, "examples/hello-world");
const cli = resolve(root, "packages/cli/dist/index.js");
const port = 4317;
const origin = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, [cli, "start"], {
  cwd: exampleDir,
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
child.stdout.setEncoding("utf8").on("data", (chunk) => { logs += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { logs += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Production server exited early.\n" + logs);
    try {
      const response = await fetch(origin + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("Production server did not become ready.\n" + logs);
}

try {
  await waitForServer();

  const health = await fetch(origin + "/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  const user = await fetch(origin + "/api/users/42");
  assert.equal(user.status, 200);
  assert.equal((await user.json()).id, "42");

  const update = await fetch(origin + "/api/users/42", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Javafy" })
  });
  assert.deepEqual(await update.json(), { id: "42", name: "Javafy", updated: true });

  const head = await fetch(origin + "/api/health", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const unsupported = await fetch(origin + "/api/health", { method: "POST" });
  assert.equal(unsupported.status, 405);
  assert.match(unsupported.headers.get("allow") ?? "", /GET/);

  const ssr = await fetch(origin + "/about");
  const ssrHtml = await ssr.text();
  assert.equal(ssr.status, 200);
  assert.match(ssrHtml, /Server render time:/);
  assert.match(ssrHtml, /__JAVAFY_FULLSTACK__/);

  const ssg = await fetch(origin + "/blog/first-post");
  const ssgHtml = await ssg.text();
  assert.equal(ssg.status, 200);
  assert.match(ssgHtml, /First Javafy post/);
  assert.match(ssgHtml, /generated at build time/);

  const second = await fetch(origin + "/blog/second-post");
  assert.equal(second.status, 200);
  assert.match(await second.text(), /Second Javafy post/);

  const unknownStaticPath = await fetch(origin + "/blog/not-generated");
  assert.equal(unknownStaticPath.status, 404);

  const missing = await fetch(origin + "/this-page-does-not-exist");
  assert.equal(missing.status, 404);

  console.log("Javafy fullstack smoke tests passed: API, SSR, SSG, and 404 handling.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 2000))]);
}
