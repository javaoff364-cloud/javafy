import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function getFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a test port");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("dev server exposes the browser diagnostics client and module graph", { timeout: 20000 }, async () => {
  const root = mkdtempSync(join(process.cwd(), ".javafy-dev-runtime-"));
  const app = join(root, "src", "app");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html><html><body><div id=\"root\"></div></body></html>");
  writeFileSync(join(root, "javafy.config.js"), 'export default { dev: { host: "127.0.0.1", port: ' + await getFreePort() + ' } };');
  writeFileSync(join(app, "page.tsx"), 'export default function Home() { return <main><h1>Runtime test</h1></main>; }');

  const cli = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const child = spawn(process.execPath, [cli, "dev"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  const port = Number((await import(join(root, "javafy.config.js"))).default.dev.port);
  const origin = "http://127.0.0.1:" + port;

  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null) throw new Error("Javafy dev server exited early:\n" + output);
      try {
        const response = await fetch(origin + "/__javafy/module-graph");
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "dev server did not become ready:\n" + output);

    const graphResponse = await fetch(origin + "/__javafy/module-graph");
    assert.equal(graphResponse.status, 200);
    const graph = await graphResponse.json();
    assert.ok(graph.modules.some((module) => module.id.endsWith("src/app/page.tsx")));

    const clientResponse = await fetch(origin + "/__javafy/client.js");
    assert.equal(clientResponse.status, 200);
    const client = await clientResponse.text();
    assert.match(client, /javafy-error-overlay/);
    assert.match(client, /build-error/);
    assert.ok(client.includes('addEventListener("hmr"'));

    const preambleResponse = await fetch(origin + "/__javafy/refresh-preamble.js");
    assert.equal(preambleResponse.status, 200);
    assert.match(await preambleResponse.text(), /injectIntoGlobalHook/);

    const appResponse = await fetch(origin + "/@javafy/app.js");
    assert.equal(appResponse.status, 200);
    const initialAppSource = await appResponse.text();
    assert.match(initialAppSource, /performReactRefresh/);
    assert.match(initialAppSource, /RefreshReg/);

    const assetsResponse = await fetch(origin + "/__javafy/assets");
    assert.equal(assetsResponse.status, 200);
    const assetNames = await assetsResponse.json();
    assert.ok(assetNames.includes("react-refresh.js"), JSON.stringify(assetNames));
    assert.ok(assetNames.includes("react-dom-client.js"), JSON.stringify(assetNames));

    const refreshRuntimeResponse = await fetch(origin + "/@javafy/react-refresh.js");
    assert.equal(refreshRuntimeResponse.status, 200);
    assert.ok((await refreshRuntimeResponse.text()).length > 0);

    const reactDomResponse = await fetch(origin + "/@javafy/react-dom-client.js");
    assert.equal(reactDomResponse.status, 200);
    assert.ok((await reactDomResponse.text()).length > 0);

    const eventsController = new AbortController();
    const eventsResponse = await fetch(origin + "/__javafy/events", { signal: eventsController.signal });
    const eventReader = eventsResponse.body.getReader();
    await eventReader.read();
    writeFileSync(join(app, "page.tsx"), 'export default function Home() { return <main><h1>Runtime updated</h1></main>; }');
    const hmrEvent = (async () => {
      let received = "";
      while (!received.includes("event: hmr")) {
        const chunk = await eventReader.read();
        if (chunk.done) return false;
        received += new TextDecoder().decode(chunk.value);
      }
      return true;
    })();
    const hmrSeen = await Promise.race([
      hmrEvent,
      new Promise((resolve) => setTimeout(() => resolve(false), 10000))
    ]);
    eventsController.abort();
    assert.equal(hmrSeen, true, "dev server did not publish an HMR event after a source edit");
    const updatedAppResponse = await fetch(origin + "/@javafy/app.js");
    assert.equal(updatedAppResponse.status, 200);
    const updatedAppSource = await updatedAppResponse.text();
    const chunkPaths = [...updatedAppSource.matchAll(/from\s+"\.\/([^"]+\.js)"/g)].map((match) => match[1]);
    const chunkSources = await Promise.all(chunkPaths.map(async (chunkPath) => {
      const chunkResponse = await fetch(origin + "/@javafy/" + chunkPath);
      assert.equal(chunkResponse.status, 200, "missing updated ESM chunk: " + chunkPath);
      return chunkResponse.text();
    }));
    assert.ok(chunkSources.some((source) => source.includes("Runtime updated")), "updated source was not found in split ESM chunks");

    const pageResponse = await fetch(origin + "/");
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    assert.match(html, /__javafy\/client\.js/);
    assert.match(html, /__javafy\/refresh-preamble\.js/);
    assert.match(html, /\/@javafy\/app\.js/);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) {
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
    }
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});
